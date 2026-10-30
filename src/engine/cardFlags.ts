// Read-only queries over the Spearhead card effects in force (GameState.cards.flags, see src/engine/cards.ts). The attack
// sequence, objective control, stat queries, charge rolls and the movement phase call these; nothing here changes state, and
// nothing here imports a service, so any engine module can use it without an import cycle.
import { ENGAGEMENT_H, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, pointInPolygon, pointToPolygonEdge, withinObjectiveRange } from './geometry'
import { unitModels } from './state'
import type { CardFlag, CardFlagKind, CardsState, GameState, Model, ObjectiveId, PlayerId, TerrainPiece, UnitId } from './types'

export function emptyCardsState(): CardsState {
  return {
    pool: { twists: {}, tactics: [] },
    shuffled: false,
    tactics: { A: { deck: [], hand: [], discard: [], scored: [] }, B: { deck: [], hand: [], discard: [], scored: [] } },
    flags: [],
    picks: [],
    discardDone: { A: 0, B: 0 },
    drawRound: { A: 0, B: 0 },
    scoreDone: '',
    turnLog: { destroyed: [], fought: [] },
    roundDestroyed: [],
    generalSlain: { A: null, B: null },
    followUp: null,
  }
}

const NO_FLAGS: CardFlag[] = []
export const flagsOf = (state: GameState): CardFlag[] => state.cards?.flags ?? NO_FLAGS

export function flagsOn(state: GameState, kind: CardFlagKind, unitId?: UnitId): CardFlag[] {
  return flagsOf(state).filter((f) => f.kind === kind && (unitId === undefined || f.unitId === unitId))
}
export const hasFlag = (state: GameState, kind: CardFlagKind, unitId: UnitId): boolean => flagsOf(state).some((f) => f.kind === kind && f.unitId === unitId)

// ---------- objectives ----------
// Ring of Fire: nobody controls, contests or takes this objective this round
export const objectiveDisabled = (state: GameState, objectiveId: ObjectiveId): boolean =>
  flagsOf(state).some((f) => f.kind === 'ringOfFire' && f.objectiveId === objectiveId)

// does any live model of the unit stand on the objective circle (the SPH-6.2 contest test, card effects ignore disabling)
export function unitOnObjective(state: GameState, unitId: UnitId, objectiveId: ObjectiveId): boolean {
  const obj = state.objectives[objectiveId]
  const u = state.units[unitId]
  if (!obj || obj.removed || !u || u.location !== 'board') return false
  const range = state.mission.data.objectiveRange ?? OBJECTIVE_RANGE
  const radius = obj.radius ?? state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  return unitModels(state, unitId).some((m) => !m.pendingRemoval && withinObjectiveRange(m, obj, 0, range, radius))
}

export function unitsOnObjective(state: GameState, objectiveId: ObjectiveId): UnitId[] {
  return Object.values(state.units).filter((u) => u.location === 'board' && unitOnObjective(state, u.id, objectiveId)).map((u) => u.id)
}

// the objective a godbeast name refers to (Dais cards): matched on the objective's display name, then its id
export function objectiveByName(state: GameState, name: string): ObjectiveId | null {
  const key = name.toLowerCase()
  for (const o of Object.values(state.objectives)) {
    if (o.removed) continue
    if ((o.name ?? '').toLowerCase() === key || o.id.toLowerCase().endsWith(key)) return o.id
  }
  return null
}

// ---------- terrain (SPH-5.9 default: a model contests a feature it is on or within combat range of) ----------
export const isLargeFeature = (p: TerrainPiece): boolean => p.id.includes('large') || p.traits.includes('obscuring')

export function modelContestsFeature(m: Model, piece: TerrainPiece): boolean {
  const p = { x: m.pos.x, z: m.pos.z }
  if (pointInPolygon(p, piece.footprint)) return true
  const reach = Math.max(m.base.radius, m.base.radius2 ?? m.base.radius)
  return pointToPolygonEdge(p, piece.footprint) - reach <= ENGAGEMENT_H + 1e-6
}

export function unitContestsLargeFeature(state: GameState, unitId: UnitId): boolean {
  const pieces = Object.values(state.board.pieces).filter(isLargeFeature)
  return unitModels(state, unitId).some((m) => pieces.some((p) => modelContestsFeature(m, p)))
}

// models of `player` contesting the feature
export function modelsOnFeature(state: GameState, player: PlayerId, piece: TerrainPiece): number {
  let n = 0
  for (const u of Object.values(state.units)) {
    if (u.player !== player || u.location !== 'board') continue
    for (const m of unitModels(state, u.id)) if (!m.pendingRemoval && modelContestsFeature(m, piece)) n++
  }
  return n
}

// ---------- attacks ----------
export interface CardHitRule { modifier: number; onlySix: boolean }

// hit roll changes from cards: Frenzy (+1 melee), Wreathed in Smoke and Go to Ground (only an unmodified 6 hits)
export function cardHitRule(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId, kind: 'ranged' | 'melee'): CardHitRule {
  const flags = flagsOf(state)
  if (flags.length === 0) return { modifier: 0, onlySix: false }
  let modifier = 0
  if (kind === 'melee' && flags.some((f) => f.kind === 'frenzy' && f.unitId === attackerUnitId)) modifier += 1
  let onlySix = flags.some((f) => f.kind === 'goToGround' && f.unitId === targetUnitId)
  if (!onlySix) {
    for (const f of flags) if (f.kind === 'wreathed' && f.objectiveId && unitOnObjective(state, targetUnitId, f.objectiveId)) { onlySix = true; break }
  }
  return { modifier, onlySix }
}

// Take the Land: the underdog adds 1 to wound rolls against units contesting a large terrain feature
export function cardWoundModifier(state: GameState, attackerPlayer: PlayerId, targetUnitId: UnitId): number {
  const f = flagsOf(state).find((x) => x.kind === 'takeTheLand' && x.player === attackerPlayer)
  return f && unitContestsLargeFeature(state, targetUnitId) ? 1 : 0
}

// Nurgle's Rot: -1 to save rolls
export const cardSaveModifier = (state: GameState, targetUnitId: UnitId): number => (hasFlag(state, 'saveMinus', targetUnitId) ? -1 : 0)

// Steel Defence: ignore Rend
export const cardIgnoresRend = (state: GameState, targetUnitId: UnitId): boolean => hasFlag(state, 'steelDefence', targetUnitId)

// Mount the Attack's spearhead: melee weapons have Charge (+1 Damage)
export const cardChargeDamage = (state: GameState, attackerUnitId: UnitId): boolean => hasFlag(state, 'spearhead', attackerUnitId)

// ward changes: Eroding Miasma (none), Fight to the Last (Ward 5+), Shield of Thorns (Ward 6+, or +1 to an existing ward)
export function cardWard(state: GameState, unitId: UnitId, current: { needed: number; modifier: number } | null): { needed: number; modifier: number } | null {
  const flags = flagsOf(state)
  if (flags.length === 0) return current
  if (flags.some((f) => f.kind === 'noWard' && f.unitId === unitId)) return null
  let out = current ? { ...current } : null
  if (flags.some((f) => f.kind === 'fightToTheLast' && f.unitId === unitId)) out = out ? { ...out, needed: Math.min(out.needed, 5) } : { needed: 5, modifier: 0 }
  if (flags.some((f) => f.kind === 'shieldOfThorns' && f.unitId === unitId)) out = out ? { ...out, modifier: Math.min(1, out.modifier + 1) } : { needed: 6, modifier: 0 }
  return out
}

// ---------- stats and rolls ----------
// Grasping Vines halves Move; Inspiring Presence adds to a Hero's Control
export function cardStatChange(state: GameState, unitId: UnitId, stat: string): { halve: boolean; delta: number } {
  const flags = flagsOf(state)
  if (flags.length === 0) return { halve: false, delta: 0 }
  if (stat === 'M') return { halve: flags.some((f) => f.kind === 'ensnared' && f.unitId === unitId), delta: 0 }
  if (stat === 'OC') return { halve: false, delta: flags.filter((f) => f.kind === 'inspiring' && f.unitId === unitId).reduce((a, f) => a + f.value, 0) }
  return { halve: false, delta: 0 }
}

// Grasping Vines: one fewer dice for charge rolls
export const cardChargeDice = (state: GameState, unitId: UnitId): number => (hasFlag(state, 'ensnared', unitId) ? 1 : 2)

// Fall Back and Rally: the retreat costs no mortal damage
export const cardNoRetreatDamage = (state: GameState, unitId: UnitId): boolean => hasFlag(state, 'rally', unitId)
