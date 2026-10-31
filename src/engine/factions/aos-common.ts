// Helpers shared by the two Spearhead armies' code hooks (cities.ts, ironjawz.ts). WP7, 13-engine-port-plan §5.
// Pure geometry / state queries plus the few effects both armies need: declared rolls, Heal, returning slain models,
// mortal damage. Nothing here knows an army; ids and numbers come from the callers.
import { ENGAGEMENT_H, EPS, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, basesOverlap, coherencyNeighboursNeeded, distance, inCoherencyRange, whollyOnBoard, whollyWithinOf, withinObjectiveRange, type Footprint } from '../geometry'
import type { AbilityUse, ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { Effect } from '../../data/types'
import { readDeclaredMove } from '../declared'
import type { EngineContext } from '../modules'
import { rollSum } from '../dice'
import { keywordsOf, modelStats, unitModels } from '../state'
import type { DiceRoll, GameState, Model, Objective, PlayerId, Unit, UnitId } from '../types'

export const onBoard = (state: GameState, unitId: UnitId | null | undefined): Unit | null => {
  const u = unitId ? state.units[unitId] : undefined
  return u && u.location === 'board' ? u : null
}

export const liveModels = (state: GameState, unitId: UnitId): Model[] => (onBoard(state, unitId) ? unitModels(state, unitId) : [])

export const hasKeyword = (state: GameState, unitId: UnitId, kw: string): boolean => keywordsOf(state, unitId).includes(kw)

// shortest gap between two units' models (Infinity when either has none on the board)
export function unitGap(state: GameState, a: UnitId, b: UnitId): number {
  let best = Infinity
  for (const ma of liveModels(state, a)) for (const mb of liveModels(state, b)) best = Math.min(best, distance(ma, mb))
  return best
}

export const unitsWithin = (state: GameState, a: UnitId, b: UnitId, range: number): boolean => unitGap(state, a, b) <= range + EPS

// "wholly within `range` of" a (single-model, in practice) reference unit: every model of `subject` has some reference model it is
// wholly within `range` of
export function whollyWithinUnit(state: GameState, subject: UnitId, reference: UnitId, range: number): boolean {
  const subjects = liveModels(state, subject)
  const refs = liveModels(state, reference)
  if (subjects.length === 0 || refs.length === 0) return false
  return subjects.every((m) => refs.some((r) => whollyWithinOf(m, r, range)))
}

// enemy units on the battlefield whose models are within combat range (3") of this unit's models. Pure range; the visibility half
// of "in combat" (CORE-1.5) is the los service's job and only ever narrows this list.
export function enemiesInCombat(state: GameState, unitId: UnitId): UnitId[] {
  const unit = onBoard(state, unitId)
  if (!unit) return []
  return Object.values(state.units)
    .filter((o) => o.player !== unit.player && o.location === 'board' && unitsWithin(state, unitId, o.id, ENGAGEMENT_H))
    .map((o) => o.id)
}

export const inCombat = (state: GameState, unitId: UnitId): boolean => enemiesInCombat(state, unitId).length > 0

// ---------- objectives ----------
export const liveObjectives = (state: GameState): Objective[] => (Object.values(state.objectives) as Objective[]).filter((o) => !o.removed)

// any live model of the unit overlaps the objective circle (the same test objectives.ts uses to contest)
export function unitContestsObjective(state: GameState, unitId: UnitId, obj: Objective): boolean {
  const range = state.mission.data.objectiveRange ?? OBJECTIVE_RANGE
  const radius = obj.radius ?? state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  return liveModels(state, unitId).some((m) => withinObjectiveRange(m, obj, 0, range, radius))
}

// does any unit of `player` contest the objective?
export function playerContestsObjective(state: GameState, player: PlayerId, obj: Objective): boolean {
  return Object.values(state.units).some((u) => u.player === player && u.location === 'board' && unitContestsObjective(state, u.id, obj))
}

// CITIES-AB-2: objective id -> the player it is consecrated for (kept in mission.custom so the frozen GameState type is unchanged)
export function consecratedMap(state: GameState): Record<string, PlayerId> {
  return (state.mission.custom.consecrated as Record<string, PlayerId> | undefined) ?? {}
}
// the objectives consecrated for `player` that they still control (consecration ends the moment the enemy takes control)
export function consecratedFor(state: GameState, player: PlayerId): Objective[] {
  const map = consecratedMap(state)
  return liveObjectives(state).filter((o) => map[o.id] === player && o.controller === player)
}

// ---------- declared rolls ----------
// The roll an activated ability declared: abilities.ts passes it in `use.roll` when the descriptor has a `roll`; otherwise the hook
// rolls a D6 itself. The target comes from the descriptor, `fallback` is the printed number.
export function declaredRoll(ctx: EngineContext, use: AbilityUse, fallback: number): { passed: boolean; total: number; roll: DiceRoll } {
  const desc = ctx.state.abilities[use.abilityId]
  const target = desc?.roll?.succeedOn ?? fallback
  const roll = use.roll ?? ctx.roll({ purpose: 'ability', player: use.player, unitId: use.unitId, commandRerollable: false })
  const total = rollSum(roll)
  return { passed: total >= target, total, roll }
}

export function announce(ctx: EngineContext, use: AbilityUse, targetUnitId: UnitId | null, summary: string): void {
  ctx.emit({ type: 'AbilityTriggered', abilityId: use.abilityId, sourceUnitId: use.unitId, targetUnitId, summary, player: use.player })
}

// descriptor `params` of the ability being used (data carries the printed constants, e.g. the 12" range)
export function paramOf<T>(state: GameState, abilityId: string, key: string, fallback: T): T {
  const v = state.abilities[abilityId]?.params?.[key]
  return v === undefined ? fallback : (v as T)
}

// `params` of the datasheet / enhancement ability with this `code` on a unit (hook methods that only know the unit, not the ability id)
export function paramsByCode(state: GameState, unitId: UnitId | null, code: string): Record<string, unknown> {
  const unit = unitId ? state.units[unitId] : undefined
  if (!unit) return {}
  const own = (state.datasheets[unit.datasheetId]?.abilities ?? []).map((id) => state.abilities[id])
  const worn = Object.values(state.abilities).filter((a) => a.source === 'enhancement' && a.bearerModelId !== null && unit.models.includes(a.bearerModelId))
  return [...own, ...worn].find((a) => a?.code === code)?.params ?? {}
}

// unit-name targeting (Freeguild Steelhelms is a name, not a keyword): exact warscroll id from params, else an id suffix
export function isDatasheet(state: GameState, unitId: UnitId, exactId: unknown, suffix: string): boolean {
  const id = state.units[unitId]?.datasheetId
  if (!id) return false
  return typeof exactId === 'string' ? id === exactId : id.endsWith(suffix)
}

// ---------- effects ----------
// mortal damage into the engine's damage path (ward, allocation and slain-model removal happen there)
export function inflictMortal(ctx: EngineContext, use: AbilityUse, targetUnitId: UnitId, count: number): void {
  if (count <= 0) return
  ctx.services.hooks.apply(ctx, { kind: 'ability', id: use.abilityId, unitId: use.unitId, modelId: null }, { kind: 'request', mortalWounds: [{ targetUnitId, count }] })
}

// the unit has damage on it (some model below its Health)
export function isDamaged(state: GameState, unitId: UnitId): boolean {
  return liveModels(state, unitId).some((m) => m.woundsRemaining < modelStats(state, m).W)
}

// CORE-13.7 Heal (N): restore up to N points of damage, damaged models first. Never returns slain models. Returns points healed.
export function healUnit(ctx: EngineContext, unitId: UnitId, amount: number, source: string): number {
  const s = ctx.state
  let left = amount
  let healed = 0
  for (const m of liveModels(s, unitId)) {
    if (left <= 0) break
    const missing = modelStats(s, m).W - m.woundsRemaining
    if (missing <= 0) continue
    const n = Math.min(missing, left)
    m.woundsRemaining += n
    left -= n
    healed += n
    ctx.emit({ type: 'WoundsRegained', unitId, modelId: m.id, amount: n, source })
  }
  return healed
}

// slain models of the unit that can still return (most recently slain last), capped at its starting strength
export function returnableModels(state: GameState, unitId: UnitId): number {
  const u = state.units[unitId]
  if (!u || u.location !== 'board') return 0
  return Math.max(0, Math.min(u.destroyedModels?.length ?? 0, u.startingStrength - u.models.length))
}

const GAPS = [0.05, 0.15, 0.3, 0.45]
const ANGLES = 24

// CORE-6.14: return up to `count` slain models, one at a time, each set up within coherency range of a model that was not returned
// this call (of at least two such models when the unit will have 7+ models), wholly on the board, not overlapping any model and not
// within combat range of an enemy. Placement is automatic (first legal spot around the anchors in model order). Returns the number
// actually returned. Returned models come back at full Health.
export function returnSlainModels(ctx: EngineContext, unitId: UnitId, count: number, source: string): number {
  const s = ctx.state
  const unit = onBoard(s, unitId)
  if (!unit) return 0
  const n = Math.min(count, returnableModels(s, unitId))
  if (n <= 0) return 0
  const anchors = unitModels(s, unitId)
  if (anchors.length === 0) return 0
  const need = coherencyNeighboursNeeded(anchors.length + n)
  const others = Object.values(s.models).filter((m) => s.units[m.unitId]?.location === 'board')
  const enemies = others.filter((m) => s.units[m.unitId].player !== unit.player)
  let returned = 0
  for (let i = 0; i < n; i++) {
    const snap = [...unit.destroyedModels].reverse()[0]
    if (!snap) break
    const spot = findSpot(s, snap, anchors, others, enemies, need)
    if (!spot) break
    const model: Model = structuredClone(snap)
    model.pos = { x: Math.round(spot.x * 1000) / 1000, y: spot.y, z: Math.round(spot.z * 1000) / 1000 }
    model.facing = spot.facing
    model.woundsRemaining = s.datasheets[unit.datasheetId].models.find((p) => p.modelId === snap.datasheetModelId)?.stats.W ?? snap.woundsRemaining
    model.oneShotUsed = []
    model.flags = { allocatedThisPhase: false, inBaseContactWithEnemy: false, desperateEscapeTested: false }
    s.models[model.id] = model
    unit.models.push(model.id)
    unit.destroyedModels = unit.destroyedModels.filter((m) => m.id !== snap.id)
    others.push(model)
    returned++
    ctx.emit({ type: 'ModelReturned', unitId, modelId: model.id, pos: model.pos, source })
  }
  return returned
}

function findSpot(s: GameState, snap: Model, anchors: Model[], others: Model[], enemies: Model[], need: number): { x: number; y: number; z: number; facing: number } | null {
  const reach = (b: Model['base']) => Math.max(b.radius, b.radius2 ?? b.radius)
  for (const gap of GAPS) {
    for (const a of anchors) {
      const d = reach(a.base) + reach(snap.base) + gap
      for (let k = 0; k < ANGLES; k++) {
        const ang = (k / ANGLES) * Math.PI * 2
        const cand: Footprint = { pos: { x: a.pos.x + Math.cos(ang) * d, y: a.pos.y, z: a.pos.z + Math.sin(ang) * d }, facing: a.facing, base: snap.base }
        if (!whollyOnBoard(cand, s.board)) continue
        if (others.some((o) => basesOverlap(cand, o))) continue
        if (enemies.some((e) => distance(cand, e) <= ENGAGEMENT_H + EPS)) continue
        const range = coherencyRangeOf(s, a.unitId)
        const neighbours = anchors.filter((o) => inCoherencyRange(cand, o, range)).length
        if (neighbours < need && neighbours < anchors.length) continue
        return { x: cand.pos.x, y: cand.pos.y, z: cand.pos.z, facing: a.facing }
      }
    }
  }
  return null
}

function coherencyRangeOf(s: GameState, unitId: UnitId): number {
  return s.datasheets[s.units[unitId]?.datasheetId]?.coherencyRange ?? 0.5
}

// ---------- SPH-2.7 tokens (F12, SCE-AB-4 / SER-AB-6) ----------
// takes up to `count` of `token` from the unit (all of them by default) and emits TokenRemoved; returns how many were taken
export function removeTokens(ctx: EngineContext, unitId: UnitId, token: string, count = Number.POSITIVE_INFINITY): number {
  const u = ctx.state.units[unitId]
  if (!u) return 0
  const have = u.tokens?.[token] ?? 0
  const n = Math.min(have, Math.max(0, count))
  if (n <= 0) return 0
  u.tokens = { ...u.tokens, [token]: have - n }
  ctx.emit({ type: 'TokenRemoved', unitId, token, count: n, remaining: have - n, player: u.player })
  return n
}

// ---------- free Retreat reactions (STD-RA-2 Fearless Invaders; F12: SCE-RA-1 Strike Where Needed) ----------
// Offered in the 'moveDeclared' window (data timing { kind 'reaction', trigger 'youDeclared', abilityId 'core.move' }, or a
// movement-phase descriptor with params.window 'moveDeclared'): the friendly unit in combat that has just declared a Retreat,
// before the retreat's mortal damage is rolled. It gets { noRetreatDamage } and { chargeAfterFallBack } until the end of the turn.
// Each army registers its own code name (and announcement) with freeRetreatHook; the descriptor's own `limit` caps its uses.
export function retreatingUnit(state: GameState, player: PlayerId): UnitId | null {
  const d = readDeclaredMove(state)
  const u = d && d.moveType === 'fallBack' ? onBoard(state, d.unitId) : null
  return u && u.player === player && inCombat(state, u.id) ? u.id : null
}
export const freeRetreatTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] => {
  const id = retreatingUnit(state, player ?? state.activePlayer)
  return id ? [id] : []
}

const FREE_RETREAT_CODES = new Set<string>()

// AI hint (src/ai/utility.ts scoreDeclareMove): the player's regiment ability is a registered free-Retreat reaction it can still use
// (its limit honoured: oncePerBattle = never used; otherwise not yet used this turn) in its own movement phase
export function freeRetreatAvailable(state: GameState, player: PlayerId): boolean {
  const reg = state.abilities[state.players[player]?.regimentAbilityId ?? '']
  if (!reg || !reg.code || !FREE_RETREAT_CODES.has(reg.code)) return false
  if (state.activePlayer !== player || state.phase !== 'movement') return false
  const uses = state.players[player].abilityUses.filter((u) => u.abilityId === reg.id)
  if (reg.limit === 'oncePerBattle') return uses.length === 0
  return !uses.some((u) => u.round === state.round && u.turn === state.activePlayer)
}

// the activated hook of a free-Retreat reaction, registered under `name`; `summary` is what the announcement says it did
export function freeRetreatHook(name: string, summary: string): EngineCodeHook {
  FREE_RETREAT_CODES.add(name)
  const activate: ActivatedAbilityHook = {
    canUse(state, _unitId, use) {
      const targets = freeRetreatTargets(state, null, use.player)
      const picked = use.targetUnitIds?.[0]
      return targets.length > 0 && (!picked || targets.includes(picked))
    },
    targets: freeRetreatTargets as ActivatedAbilityHook['targets'],
    resolve(ctx, use) {
      const target = use.targetUnitIds[0]
      if (!target || !onBoard(ctx.state, target)) return
      const effects: Effect[] = [{ chargeAfterFallBack: true }, { noRetreatDamage: true }]
      ctx.services.effects.grant(ctx, target, effects, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
      announce(ctx, use, target, summary)
    },
  }
  return { name, kind: 'ability', hook: 'onAbilityDeclared', run: () => undefined, activate }
}
