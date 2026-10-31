// Heuristic AI for Spearhead (owner: src/ai). Implements the engine's Decider interface (00-arch §3) by scoring every
// legal action for the current decision with cheap heuristics (docs/spec/40-ai.md, simplified: playable first). It
// walks toward objectives, shoots the most damaging target, charges when a charge is likely, and fights. `easy` picks
// randomly among the top 3 scored actions; `normal` always takes the best. Stratagems / CP do not exist (PORT-0.4).
import {
  DEFAULT_SERVICES, boardModelsOf, boardUnitsOf, deploymentZone, distance, hasKeyword, legalActions,
  modelStats, unitModels, validate, basesOverlap, type Footprint, whollyOnBoard, whollyWithinPolygon, pointInPolygon, withinEngagementRange, withinObjectiveRange,
  type Action, type DeclareChargeAction, type DeclareMoveAction, type DeclareTargetsAction, type Decider,
  type DeployUnitAction, type GameState, type ModelPlacement, type ObjectiveId, type PendingDecision, type PlayerId,
  type PlayerView, type Polygon, type UnitId,
} from '../engine'
import { createRng, restoreRng, type Rng } from '../engine/rng'
import { deployTerrainBlock } from '../engine/terrain'
import { terrainLineClear } from '../engine/los'
import { hookService } from '../engine/hooks-impl'
import { chargeDiceCount } from '../engine/phases/charge'
import { tacticOdds } from '../engine/cards'
import { kruleboyzAbilityTiming, kruleboyzTargetBonus } from '../engine/factions/kruleboyz'
import { gloomspiteAbilityTiming, retreatsAndCharges } from '../engine/factions/gloomspite'
import { kharadronAbilityTiming, kharadronActivationBonus, kharadronDeployBonus, kharadronModeBonus, kharadronMoveBonus, kharadronTargetBonus } from '../engine/factions/kharadron'
import { stormcastAbilityTiming, stormcastModeBonus, stormcastTargetBonus } from '../engine/factions/stormcast'
import { slavesFreeRetreatAvailable } from '../engine/factions/slaves'
import { soulblightAbilityTiming, soulblightChargeBonus, soulblightModeBonus, soulblightTargetBonus } from '../engine/factions/soulblight'
import { skavenAbilityTiming, skavenTargetBonus } from '../engine/factions/skaven'
import { nurgleAbilityTiming, nurgleModeBonus, nurgleTargetBonus } from '../engine/factions/nurgle'
import { seraphonAbilityTiming, seraphonTargetBonus } from '../engine/factions/seraphon'
import { khorneAbilityTiming, khorneTargetBonus } from '../engine/factions/khorne'
import { nighthauntAbilityTiming, nighthauntTargetBonus } from '../engine/factions/nighthaunt'
import { sylvanethAbilityTiming, sylvanethTargetBonus } from '../engine/factions/sylvaneth'
import { citiesHoldWeight } from '../engine/factions/cities'
import { extraMoveCandidates } from './moves'
import { underdogCardChase, underdogExposure, underdogObjectiveScale } from './underdogs'
import { objectiveVp } from './objectives'
import {
  bestRangedRangeOfUnit, expectedAttack, hasAnyMeleeWeapon, hasAnyRangedWeapon, isGunline,
  sumExpectedAttacks, threatAt, threatFrom, threatSources, type ThreatSource, unitMeleeDamage, unitRangedDamage, unitValue,
} from './expected'
import { buildFormation, shapeRoleScore, shapesForRole, type FormationModel, type FormationRole, type FormationShape } from './formations'

export type Difficulty = 'easy' | 'normal'

const ENGAGEMENT_H = 3 // combat range (CORE-1.4); mirrors src/engine/geometry.ts

export function other(p: PlayerId): PlayerId { return p === 'A' ? 'B' : 'A' }


function polyCentroid(poly: Polygon): { x: number; z: number } {
  if (poly.length === 0) return { x: 0, z: 0 }
  let x = 0, z = 0
  for (const p of poly) { x += p.x; z += p.z }
  return { x: x / poly.length, z: z / poly.length }
}

function placementsCenter(placements: ModelPlacement[]): { x: number; z: number } {
  if (placements.length === 0) return { x: 0, z: 0 }
  let x = 0, z = 0
  for (const p of placements) { x += p.pos.x; z += p.pos.z }
  return { x: x / placements.length, z: z / placements.length }
}

// Spearhead scoring (SPH-11.1) gives the same VP for every objective (hold one, hold two, hold more than the enemy),
// so every live objective is worth the same weight; a removed one is worth nothing.
export function objectiveScoreWeight(state: GameState, _player: PlayerId, objectiveId: ObjectiveId): number {
  const obj = state.objectives[objectiveId]
  return obj && !obj.removed ? 2.5 : 0.15
}

// Σ over live objectives of a pull term (closer + on-marker is better; enemy-held markers pull harder — contest
// them; each objective is weighted by how much it's actually worth holding under this mission's scoring, so the
// AI chases scored centre/enemy-home markers instead of camping a marker that scores nobody anything)
function objectivePull(state: GameState, player: PlayerId, pos: { x: number; z: number }, unitId?: UnitId): number {
  let score = 0
  const cover = unitId ? objectiveCover(state, player, unitId) : null
  const reach = enemyReachOC(state, player)
  // faction hint: a unit whose job is the counter-charge feels less of the pull of markers its army already holds
  const hold = unitId ? citiesHoldWeight(state, unitId) ?? 1 : 1
  for (const obj of Object.values(state.objectives)) {
    if (obj.removed) continue
    const controller = DEFAULT_SERVICES.objectives.controller(state, obj.id)
    const weight = objectiveScoreWeight(state, player, obj.id)
    // control is sticky (SPH-6.3): a marker we hold that no enemy can reach next turn stays ours with nobody on it, so it
    // only needs a guard once the enemy is in range of it; the free units go for the centre and the enemy's markers
    const threatened = (reach.get(obj.id) ?? 0) > 0
    const mineBase = threatened ? 3.5 : 1.2
    const base = (controller === player ? mineBase * hold : controller === other(player) ? 8 : 5) * weight
    const d = Math.hypot(obj.pos.x - pos.x, obj.pos.z - pos.z)
    // role spread: a marker other friendly units already hold with more Control than the enemy can bring is somebody
    // else's job, so this unit's pull toward it shrinks and it goes for the next marker instead of stacking up
    const share = cover?.get(obj.id) ?? 1
    // gentler falloff than 1/(1+d): a scored objective should still pull meaningfully from a turn or two's move
    // away (6-12"), not only once a unit is already almost on top of it
    score += (base / (1 + d / 6)) * share
    if (d <= 3) score += (controller === player ? (threatened ? 1.5 : 0.2) * hold : 6) * weight * share
  }
  return score
}

// per objective: the Control the enemy could put on it next turn (models within a move and a short charge of it)
const reachCache = new WeakMap<GameState, Record<string, Map<string, number>>>()
function enemyReachOC(state: GameState, player: PlayerId): Map<string, number> {
  let byPlayer = reachCache.get(state)
  if (!byPlayer) { byPlayer = {}; reachCache.set(state, byPlayer) }
  const hit = byPlayer[player]
  if (hit) return hit
  const out = new Map<string, number>()
  const foes = boardModelsOf(state, other(player))
  for (const obj of Object.values(state.objectives)) {
    if (obj.removed) continue
    let theirs = 0
    for (const m of foes) if (Math.hypot(m.pos.x - obj.pos.x, m.pos.z - obj.pos.z) <= modelStats(state, m).M + 6) theirs += modelStats(state, m).OC
    out.set(obj.id, theirs)
  }
  byPlayer[player] = out
  return out
}

// per objective, how much of its pull is left for `unitId` once the other friendly units are counted: 1 when nobody else
// is on it (or the enemy can bring as much Control as they have), down to 0.3 when it is already safely held by others
const coverCache = new WeakMap<GameState, Map<UnitId, Map<string, number>>>()
function objectiveCover(state: GameState, player: PlayerId, unitId: UnitId): Map<string, number> {
  let byUnit = coverCache.get(state)
  if (!byUnit) { byUnit = new Map(); coverCache.set(state, byUnit) }
  const hit = byUnit.get(unitId)
  if (hit) return hit
  const out = new Map<string, number>()
  const friends = boardModelsOf(state, player).filter((m) => m.unitId !== unitId)
  const reach = enemyReachOC(state, player)
  for (const obj of Object.values(state.objectives)) {
    if (obj.removed) continue
    let mine = 0
    for (const m of friends) if (withinObjectiveRange(m, obj)) mine += modelStats(state, m).OC
    const theirs = reach.get(obj.id) ?? 0
    out.set(obj.id, mine === 0 ? 1 : mine > theirs ? 0.3 : mine > theirs * 0.6 ? 0.65 : 1)
  }
  byUnit.set(unitId, out)
  return out
}

// crude edge-to-edge gap from a point to the nearest enemy unit (no model-vs-model measurement, just a probe point)
export function nearestEnemyFromPoint(state: GameState, player: PlayerId, pos: { x: number; z: number }): { gap: number; unitId: UnitId } | null {
  let best: { gap: number; unitId: UnitId } | null = null
  for (const u of boardUnitsOf(state, other(player))) {
    for (const m of unitModels(state, u.id)) {
      const gap = Math.max(0, Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z) - m.base.radius)
      if (!best || gap < best.gap) best = { gap, unitId: u.id }
    }
  }
  return best
}

// real edge-to-edge gap between two units' models (used once positions are actually known, e.g. for a charge)
export function nearestEnemyUnit(state: GameState, player: PlayerId, unitId: UnitId): { gap: number; unitId: UnitId } | null {
  const mine = unitModels(state, unitId)
  if (mine.length === 0) return null
  let best: { gap: number; unitId: UnitId } | null = null
  for (const u of boardUnitsOf(state, other(player))) {
    const theirs = unitModels(state, u.id)
    let gap = Infinity
    for (const a of mine) for (const b of theirs) gap = Math.min(gap, distance(a, b))
    if (!best || gap < best.gap) best = { gap, unitId: u.id }
  }
  return best
}

export function minGapBetweenUnits(state: GameState, a: UnitId, b: UnitId): number {
  const as = unitModels(state, a), bs = unitModels(state, b)
  let gap = Infinity
  for (const x of as) for (const y of bs) gap = Math.min(gap, distance(x, y))
  return gap
}

export function centerOfUnit(state: GameState, unitId: UnitId): { x: number; z: number } | null {
  const models = unitModels(state, unitId)
  if (models.length === 0) return null
  let x = 0, z = 0
  for (const m of models) { x += m.pos.x; z += m.pos.z }
  return { x: x / models.length, z: z / models.length }
}

// enemy units currently within Engagement Range of unitId (used to check whether a fight-phase stratagem is
// actually about to matter, e.g. Veteran Instincts / Epic Challenge)
export function engagedEnemyUnits(state: GameState, player: PlayerId, unitId: UnitId): UnitId[] {
  const mine = unitModels(state, unitId)
  const out: UnitId[] = []
  for (const u of boardUnitsOf(state, other(player))) {
    const theirs = unitModels(state, u.id)
    if (mine.some((a) => theirs.some((b) => withinEngagementRange(a, b)))) out.push(u.id)
  }
  return out
}

// 2D6 ≥ n probability table (40-ai.md §5)
const CHARGE_PROB: Record<number, number> = { 2: 1, 3: 0.972, 4: 0.917, 5: 0.833, 6: 0.722, 7: 0.583, 8: 0.417, 9: 0.278, 10: 0.167, 11: 0.083, 12: 0.028 }
// F12 (SCE-AB-5): P(sum of `dice` D6 ≥ n) for any dice count (engine chargeDiceCount), exact by convolution
const SUM_DIST = new Map<number, number[]>()
function atLeastNd6(dice: number, n: number): number {
  let dist = SUM_DIST.get(dice)
  if (!dist) {
    dist = [1]
    for (let d = 0; d < dice; d++) {
      const next = new Array(dist.length + 6).fill(0)
      dist.forEach((p, s) => { for (let f = 1; f <= 6; f++) next[s + f] += p / 6 })
      dist = next
    }
    SUM_DIST.set(dice, dist)
  }
  return dist.reduce((a, p, s) => a + (s >= n ? p : 0), 0)
}
export function chargeProb(needed: number, dice = 2): number {
  if (dice !== 2) return needed <= dice ? 1 : atLeastNd6(Math.max(1, dice), needed)
  if (needed <= 2) return 1
  if (needed >= 12) return needed === 12 ? CHARGE_PROB[12] : 0
  return CHARGE_PROB[needed] ?? 0.417
}

function countEngagedAfter(state: GameState, unitId: UnitId, placements: ModelPlacement[]): number {
  const player = state.units[unitId]?.player
  if (!player) return 0
  const enemies = boardModelsOf(state, other(player))
  let n = 0
  for (const p of placements) {
    const model = state.models[p.modelId]
    if (!model) continue
    const fp = { pos: p.pos, facing: p.facing ?? model.facing, base: model.base }
    if (enemies.some((e) => withinEngagementRange(fp, e))) n++
  }
  return n
}

// nearest objective actually worth holding (objectiveScoreWeight > 1), and how far it is from `pos` — used to
// reward *closing the gap* on top of the absolute objectivePull, see scorePosition below.
function nearestValuableObjective(state: GameState, player: PlayerId, pos: { x: number; z: number }): { dist: number; weight: number } | null {
  let best: { dist: number; weight: number } | null = null
  for (const obj of Object.values(state.objectives)) {
    if (obj.removed) continue
    const weight = objectiveScoreWeight(state, player, obj.id)
    if (weight <= 1) continue
    const dist = Math.hypot(obj.pos.x - pos.x, obj.pos.z - pos.z)
    if (!best || dist < best.dist) best = { dist, weight }
  }
  return best
}

// Shared position scorer for moveUnit / chargeMove / pileIn / consolidate: objective pull, threat avoidance,
// charge/shoot readiness, and (for charge/consolidate) how many models end up fighting.
function scorePosition(state: GameState, player: PlayerId, unitId: UnitId, placements: ModelPlacement[], bonusEngage: boolean, moveType?: string): number {
  if (placements.length === 0) return 0
  const center = placementsCenter(placements)
  let score = objectivePull(state, player, center, unitId)
  // a melee unit (the hammer: knights, the general) wants to end where it can charge next turn, so enemy reach worries it far
  // less than it worries a gun crew or a line holder; without this the threat term (every enemy's whole value) pins a
  // melee army's hammer in its own deployment zone for the whole game
  const nearest = nearestEnemyUnit(state, player, unitId)
  const hammer = !isGunline(state, unitId) && hasAnyMeleeWeapon(state, unitId) && nearest !== null
    && unitMeleeDamage(state, unitId, nearest.unitId, { charged: true }) >= unitMeleeDamage(state, nearest.unitId, unitId, {}) * 0.8
  // a lone hero (often the general) is a hammer that dies to one bad round of combat: it keeps more distance than a mob does
  const loneHero = hasKeyword(state, unitId, 'HERO') && placements.length <= 1
  // the game's last turn, and it is ours: nobody gets to strike back after it, so only the end-of-turn control counts
  const final = finalTurnOf(state, player)
  score -= threatAt(state, player, center) * (hammer && !loneHero ? 0.7 : 2) * (final ? 0.1 : 1) * expendable(state, unitId, 0.7)
  if (loneHero) {
    // and it stays with the army: a general out on its own is the easiest kill on the table
    let nearestFriend = Infinity
    for (const u of boardUnitsOf(state, player)) {
      if (u.id === unitId) continue
      const c = centerOfUnit(state, u.id)
      if (c) nearestFriend = Math.min(nearestFriend, Math.hypot(c.x - center.x, c.z - center.z))
    }
    if (nearestFriend < Infinity) score -= Math.max(0, nearestFriend - 7) * 0.5
  }
  // objectivePull's gradient is gentle at range (by design, so a unit doesn't panic-sprint from 20" out) and
  // threatAt already grows the moment a unit enters any enemy's threat radius, so early on a unit can find every
  // reachable placement scores about the same (or worse) than just not moving at all — it "freezes" in its
  // deployment zone for the whole game rather than ever closing on a valuable objective. Reward the move itself
  // for closing distance to the nearest valuable objective, independent of the absolute pull, so progress always
  // beats standing still.
  const currentCenter = centerOfUnit(state, unitId)
  if (currentCenter) {
    const before = nearestValuableObjective(state, player, currentCenter)
    const after = nearestValuableObjective(state, player, center)
    if (before && after && before.dist > 3) score += Math.max(0, before.dist - after.dist) * Math.min(before.weight, after.weight) * 0.15
  }
  const enemy = nearestEnemyFromPoint(state, player, center)
  let chargeNowP = 0
  if (enemy) {
    if (hasAnyMeleeWeapon(state, unitId)) {
      // a charge must end within 1/2" (CORE-9.4), so what it needs is the model-to-model gap minus 1/2"; a unit that ran or
      // retreated cannot charge this turn, so for it (and outside the movement phase) only next turn's charge counts
      const mt = moveType ?? state.units[unitId]?.turn.moveType
      // (nor can one that may not charge this turn at all: carried by Ply the Skies, and the like)
      const chargeNow = state.phase === 'movement' && mt !== 'advance' && (mt !== 'fallBack' || retreatsAndCharges(state, unitId)) && !hookService.chargeForbidden(state, unitId)
      const gap = placementGapTo(state, placements, enemy.unitId)
      const trade = chargeTrade(state, player, unitId, enemy.unitId)
      if (chargeNow) chargeNowP = chargeProb(Math.ceil(Math.max(0, gap - 0.5)), chargeDiceCount(state, unitId))
      if (chargeNow) score += chargeNowP * trade * (hammer ? 1 : 0.6)
      else if (!final) score += chargeProb(Math.ceil(Math.max(0, gap - 0.5 - stats0(state, unitId).M)), chargeDiceCount(state, unitId)) * trade * (hammer ? 0.35 : 0.2)
    }
    if (hasAnyRangedWeapon(state, unitId)) {
      const range = bestRangedRangeOfUnit(state, unitId)
      if (range !== null && enemy.gap <= range) score += unitValue(state, enemy.unitId) * 0.05
    }
  }
  if (bonusEngage) score += countEngagedAfter(state, unitId, placements) * 3
  // army hints (src/ai/underdogs.ts, Slaves only): what ending a move here leaves the unit open to in the enemy's next turn, and
  // the battle tactics in hand it completes
  else {
    if (!final) score -= underdogExposure(state, player, unitId, placements, chargeNowP)
    score += underdogCardChase(state, player, unitId, placements)
  }
  // who holds what at the end of the turn if the unit ends here: stepping on a circle pays only when its Control flips or keeps it
  // (steal an enemy marker it out-numbers, hold the one the enemy is on), and the hold-more point counts (src/ai/objectives.ts)
  score += VP_W * (final ? 2.5 : 1) * objectiveVp(state, player, { unitId, placements }) * (underdogObjectiveScale(state, player) ?? 1)
  return score
}

// a Reinforcements unit that has not been replaced yet comes back once when it is destroyed (Call for Reinforcements, SPH core):
// losing it costs less, so its risk terms are scaled by `factor`
function expendable(state: GameState, unitId: UnitId, factor: number): number {
  const u = state.units[unitId]
  return u && u.replacementOf === null && !u.replaced && hasKeyword(state, unitId, 'REINFORCEMENTS') ? factor : 1
}

// the last turn of the battle is `player`'s own (the second turn of the last round): no enemy turn follows it
export function finalTurnOf(state: GameState, player: PlayerId): boolean {
  const rounds = (state.mission?.data as { rounds?: number } | undefined)?.rounds ?? 4
  return state.round >= rounds && state.activePlayer === player && state.firstPlayer !== player
}

// score units per VP of the end-of-turn objective picture (objectivePull on a marker is ~35, a dead 100-point unit ~2 per wound)
const VP_W = 6

const stats0 = (state: GameState, unitId: UnitId) => modelStats(state, unitModels(state, unitId)[0])

// the best position score this unit could reach with a move of `dist` inches (rigid slides toward every objective, every
// enemy unit and the compass points; cheap legality: on the board, no overlap, outside enemy combat range). Lets the move
// declaration compare Normal move / Run / stay by where each could actually end, not by distance thresholds.
function bestReach(state: GameState, player: PlayerId, unitId: UnitId, dist: number, moveType: string): number {
  const models = unitModels(state, unitId)
  if (models.length === 0) return -Infinity
  const c = placementsCenter(models.map((m) => ({ modelId: m.id, pos: m.pos })))
  const aims: { x: number; z: number; stop: number }[] = []
  for (const o of Object.values(state.objectives)) if (!o.removed) aims.push({ x: o.pos.x, z: o.pos.z, stop: 0 })
  for (const u of boardUnitsOf(state, other(player))) { const e = centerOfUnit(state, u.id); if (e) aims.push({ x: e.x, z: e.z, stop: 4.5 }) }
  for (let i = 0; i < 8; i++) aims.push({ x: c.x + Math.cos((i * Math.PI) / 4) * 50, z: c.z + Math.sin((i * Math.PI) / 4) * 50, stop: 0 })
  const others = Object.values(state.models).filter((m) => m.unitId !== unitId && state.units[m.unitId]?.location === 'board' && m.woundsRemaining > 0)
  const enemies = others.filter((m) => state.units[m.unitId]?.player !== player)
  let best = -Infinity
  for (const aim of aims) {
    const d = Math.hypot(aim.x - c.x, aim.z - c.z)
    if (d < 0.3) continue
    const reach = Math.min(dist, Math.max(0, d - aim.stop))
    if (reach < 0.3) continue
    const ux = (aim.x - c.x) / d, uz = (aim.z - c.z) / d
    for (const frac of [1, 0.6, 0.3]) {
      const placements: ModelPlacement[] = models.map((m) => ({ modelId: m.id, pos: { x: m.pos.x + ux * reach * frac, y: m.pos.y, z: m.pos.z + uz * reach * frac }, facing: m.facing }))
      const ok = placements.every((p, i) => {
        const fp = { pos: p.pos, facing: models[i].facing, base: models[i].base }
        return whollyOnBoard(fp, state.board) && !others.some((o) => basesOverlap(fp, o)) && !enemies.some((e) => withinEngagementRange(fp, e))
      })
      if (!ok) continue
      best = Math.max(best, scorePosition(state, player, unitId, placements, false, moveType))
      break
    }
  }
  return best
}

// edge-to-edge gap from a set of planned placements to the nearest model of `targetId`
function placementGapTo(state: GameState, placements: ModelPlacement[], targetId: UnitId): number {
  let gap = Infinity
  const theirs = unitModels(state, targetId)
  for (const p of placements) {
    const r = state.models[p.modelId]?.base.radius ?? 0.5
    for (const t of theirs) gap = Math.min(gap, Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) - r - t.base.radius)
  }
  return Math.max(0, gap)
}

// what a successful charge by `unitId` into `targetId` is worth (damage traded in value terms, plus the marker it fights
// for), floored at 0; cached per state since it does not depend on where the unit ends its move
const tradeCache = new WeakMap<GameState, Map<string, number>>()
function chargeTrade(state: GameState, player: PlayerId, unitId: UnitId, targetId: UnitId): number {
  let m = tradeCache.get(state)
  if (!m) { m = new Map(); tradeCache.set(state, m) }
  const key = `${unitId}>${targetId}`
  const hit = m.get(key)
  if (hit !== undefined) return hit
  const dmg = unitMeleeDamage(state, unitId, targetId, { charged: true })
  const wounds = unitModels(state, targetId).reduce((a, x) => a + x.woundsRemaining, 0)
  let ret = unitMeleeDamage(state, targetId, unitId, {})
  // a unit that strikes first after charging (For Sigmar, Charge! and the like) takes back only what survives its blows, the
  // same discount scoreDeclareCharge gives the charge itself; without it the move that sets the charge up looks worse than it is
  if (wounds > 0 && strikesFirstOnCharge(state, unitId)) ret *= Math.max(0, 1 - dmg / wounds)
  const v = Math.max(0, dmg * unitValue(state, targetId) * 0.02 - ret * unitValue(state, unitId) * 0.02 * 0.5 * expendable(state, unitId, 0.6) + chargeObjectiveSwing(state, player, unitId, targetId, dmg, wounds))
  m.set(key, v)
  return v
}

// Deployment-only objective pull. objectivePull's flat "+6*weight when within 3 inch" bonus is fine for a unit that is
// already moving, but at deployment it is the whole story: under holdObjectives every marker (home ones included) has
// weight ~3, so the single in-zone marker is worth ~+18 on top of ~15, every unit piles onto it, and the deployment looks
// like one blob in one spot. So here (a) each marker's value shrinks with every friendly unit already parked within 6
// inch of it, which spreads units across the markers they can reach, and (b) pure shooters only get a fraction of the
// on-marker bonus, they just need to stay within a move of it with a fire lane.
function deployObjectivePull(state: GameState, player: PlayerId, unitId: UnitId, pos: { x: number; z: number }, onMarkerShare: number): number {
  let score = 0
  const mates = boardUnitsOf(state, player).filter((u) => u.id !== unitId).map((u) => centerOfUnit(state, u.id)).filter((c): c is { x: number; z: number } => c !== null)
  for (const obj of Object.values(state.objectives)) {
    if (obj.removed) continue
    const controller = DEFAULT_SERVICES.objectives.controller(state, obj.id)
    const weight = objectiveScoreWeight(state, player, obj.id)
    const base = (controller === player ? 3 : controller === other(player) ? 8 : 5) * weight
    const covered = mates.filter((c) => Math.hypot(c.x - obj.pos.x, c.z - obj.pos.z) <= 6).length
    const share = 1 / (1 + 0.9 * covered)
    const d = Math.hypot(obj.pos.x - pos.x, obj.pos.z - pos.z)
    score += (base / (1 + d / 6)) * share
    if (d <= 3) score += (controller === player ? 1 : 6) * weight * share * onMarkerShare
  }
  return score
}

function scoreDeployUnit(state: GameState, player: PlayerId, action: DeployUnitAction, threats?: ThreatSource[]): number {
  if (action.toReserves) return 0.5
  const center = placementsCenter(action.placements)
  const meleeOnly = hasAnyMeleeWeapon(state, action.unitId) && !hasAnyRangedWeapon(state, action.unitId)
  const shooter = hasAnyRangedWeapon(state, action.unitId) && !meleeOnly
  let score = deployObjectivePull(state, player, action.unitId, center, shooter ? 0.3 : 1)
  score -= (threats ? threatFrom(threats, center) : threatAt(state, player, center)) * 2
  // army hint (src/ai/underdogs.ts, Slaves only): the shooting this set-up spot is open to
  score -= underdogExposure(state, player, action.unitId, action.placements, 0, true)
  const zoneCentroid = polyCentroid(deploymentZone(state, other(player)))
  if (meleeOnly) {
    const dToEnemy = Math.hypot(center.x - zoneCentroid.x, center.z - zoneCentroid.z)
    score += Math.max(0, 40 - dToEnemy) * 0.03
  }
  // friendly units already deployed: keep a spread (centre-to-centre), a unit-level term on top of model overlap
  let crowd = 0
  for (const u of boardUnitsOf(state, player)) {
    if (u.id === action.unitId) continue
    const c = centerOfUnit(state, u.id)
    if (!c) continue
    const d = Math.hypot(c.x - center.x, c.z - center.z)
    if (d < 8) crowd += 8 - d
  }
  score -= crowd * 0.4
  // A deployment right in a board-edge corner can leave a unit with almost no room to maneuver later — every
  // "move toward the objective" direction ends up crossing the board edge or a ruin wall that's often tucked into
  // that same corner, so the unit ends up stuck in place move after move despite still having full Move stat.
  // Objective pull alone doesn't see that cost (it only measures distance, not "can I actually go anywhere from
  // here"), so nudge deployment away from tight corners as a cheap proxy.
  const edgeMargin = 2.5
  const edgeDist = Math.min(state.board.w / 2 - Math.abs(center.x), state.board.h / 2 - Math.abs(center.z))
  if (edgeDist < edgeMargin) score -= (edgeMargin - edgeDist) * 1.5
  return score
}

function scoreDeclareMove(state: GameState, player: PlayerId, action: DeclareMoveAction): number {
  const unitId = action.unitId
  const models = unitModels(state, unitId)
  if (models.length === 0) return 0
  const stats = modelStats(state, models[0])
  const ranged = hasAnyRangedWeapon(state, unitId)
  const melee = hasAnyMeleeWeapon(state, unitId)
  // HEAVY's +1 to hit only pays for the models that actually carry a HEAVY gun. Treating "any model has one" as a
  // whole-unit trait made a 10-man Crusader squad (two bolt rifles among the chainswords, plus its Marshal) score like
  // a Heavy Intercessor gunline and Remain Stationary in its deployment corner for the entire battle. Scale the bonus
  // by the share of models carrying one instead.
  const heavyShare = models.filter((m) => m.weapons.some((w) => DEFAULT_SERVICES.weapons.hasAbility(DEFAULT_SERVICES.weapons.effectiveWeapon(state, m.id, w), 'HEAVY'))).length / models.length
  // both "am I already sitting somewhere useful" and "how far to the nearest unheld marker" need to know whether
  // holding that marker actually scores anything under the live mission (weight > 1) — otherwise a unit happily
  // parks on / advances toward its own non-scoring home objective instead of a farther one that pays out
  const onControlledValuableObjective = Object.values(state.objectives).some(
    (o) => !o.removed && DEFAULT_SERVICES.objectives.controller(state, o.id) === player
      && objectiveScoreWeight(state, player, o.id) > 1 && models.some((m) => withinObjectiveRange(m, o)),
  )
  const holdNeeded = Object.values(state.objectives).some((o) => {
    if (o.removed || DEFAULT_SERVICES.objectives.controller(state, o.id) !== player || !models.some((m) => withinObjectiveRange(m, o))) return false
    const others = boardUnitsOf(state, player).some((u) => u.id !== unitId && unitModels(state, u.id).some((m) => withinObjectiveRange(m, o)))
    const enemyNear = boardModelsOf(state, other(player)).some((m) => Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z) <= 14)
    return enemyNear && !others
  })
  let nearestUnheld = Infinity
  let nearestValuableUnheld = Infinity
  for (const o of Object.values(state.objectives)) {
    if (o.removed || DEFAULT_SERVICES.objectives.controller(state, o.id) === player) continue
    const weight = objectiveScoreWeight(state, player, o.id)
    for (const m of models) {
      const d = Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z)
      nearestUnheld = Math.min(nearestUnheld, d)
      if (weight > 1) nearestValuableUnheld = Math.min(nearestValuableUnheld, d)
    }
  }
  const nearestUnheldTarget = nearestValuableUnheld < Infinity ? nearestValuableUnheld : nearestUnheld
  const enemy = nearestEnemyUnit(state, player, unitId)
  const gap = enemy?.gap ?? Infinity
  const rangedRange = bestRangedRangeOfUnit(state, unitId) ?? 24
  // elite-army play (40-ai.md priority): a gunline unit only benefits from staying put if it's actually about to
  // shoot something from here — HEAVY's +1 to hit and "already in range" only matter with a target in range right
  // now. Otherwise standing still just camps deployment while objectives (often worth far more than a stray shot)
  // sit uncontested — this was letting Marine gunline squads freeze in place for entire games (never reaching any
  // scored objective) since the flat HEAVY/ranged bonus applied unconditionally.
  const canShootFromHere = ranged && gap <= rangedRange
  // A unit whose expected melee damage into the nearest enemy beats its expected shooting is the hammer: its job is to
  // walk toward the enemy every turn, not to camp a fire lane for a couple of pistol shots. Only judged while there is
  // an enemy to measure against and the unit is not already in Engagement Range (then it is Fall Back vs stay).
  const meleeLeaning = melee && enemy !== null && gap > ENGAGEMENT_H
    && unitMeleeDamage(state, unitId, enemy.unitId, {}) > unitRangedDamage(state, unitId, enemy.unitId, {})
  // a war machine (gunline): with a target in range it stands and fires, the more so when moving would cost it a profile
  // (Shot and Shell: no Cannonball after a Move ability)
  const gun = isGunline(state, unitId)
  const gunTarget = gun && boardUnitsOf(state, other(player)).some((e) => unitRangedDamage(state, unitId, e.id, { inRangeOnly: true }) > 0)
  let losesProfile = false
  if (gun) {
    const unit = state.units[unitId]
    const moved = { ...state, units: { ...state.units, [unitId]: { ...unit, turn: { ...unit.turn, moveType: 'normal' as const } } } } as GameState
    losesProfile = models.some((m) => m.weapons.some((w) => state.weapons[w]?.kind === 'ranged'
      && DEFAULT_SERVICES.weapons.isAvailable(state, m.id, w) && !DEFAULT_SERVICES.weapons.isAvailable(moved, m.id, w)))
  }
  // out of combat, compare the move types by where each one could actually end (bestReach), then add what the position
  // score cannot see: a war machine losing a profile by moving, shooting forfeited by a Run
  if (gap > ENGAGEMENT_H + 0.5 && action.moveType !== 'fallBack') {
    if (action.moveType === 'stationary') {
      const here = models.map((m) => ({ modelId: m.id, pos: m.pos, facing: m.facing }))
      let s = scorePosition(state, player, unitId, here, false, 'stationary')
      if (gunTarget) s += losesProfile ? 6 : 4
      if (ranged && !melee && canShootFromHere) s += 1.5
      return s
    }
    if (action.moveType === 'normal') return bestReach(state, player, unitId, stats.M, 'normal') - (gunTarget && losesProfile ? 3 : 0)
    if (action.moveType === 'advance') {
      let s = bestReach(state, player, unitId, stats.M + 3, 'advance')
      if (gunTarget) s -= 4
      if (ranged) s -= gap <= rangedRange + stats.M ? (meleeLeaning ? 1.0 : 3.0) : 0.5
      return s
    }
  }
  switch (action.moveType) {
    case 'stationary': {
      let s = 1.0
      if (gunTarget) s += losesProfile ? 6 : 4
      if (ranged && canShootFromHere) s += 2.5 * heavyShare
      // control is sticky (CORE-17.5): staying pays only when this unit is the one keeping an enemy off a marker it holds
      if (onControlledValuableObjective) s += holdNeeded ? 1.5 : 0.4
      if (ranged && !melee && canShootFromHere) s += 1.5
      if (!canShootFromHere && !onControlledValuableObjective) s -= 1.5
      if (meleeLeaning) s -= 1.0
      return s
    }
    case 'normal': {
      // Normal moves keep full shooting eligibility (only Advance/Fall Back forfeit it), so a ranged unit loses
      // nothing by repositioning toward a valuable objective while still able to shoot this turn.
      let s = 2.0
      if (gunTarget && losesProfile) s -= 3
      if (melee && !gun && gap > stats.M + ENGAGEMENT_H && gap <= stats.M + 12) s += 1.0
      else if (meleeLeaning && gap > stats.M + 12) s += 0.5 // still closing: next turn's charge starts from here
      if (nearestUnheldTarget <= stats.M + 6) s += 1.5
      return s
    }
    case 'advance': {
      let s = 1.0
      if (gunTarget) s -= 4
      if (nearestUnheldTarget > stats.M && nearestUnheldTarget <= stats.M + 3.5) s += 3.0
      if (melee && gap > stats.M && gap <= stats.M + 10.5) s += 1.5
      // forfeits shooting this turn — which costs a hammer unit little
      if (ranged) s -= gap <= rangedRange + stats.M ? (meleeLeaning ? 1.0 : 3.0) : 0.5
      return s
    }
    case 'fallBack': {
      let s = -3.0
      if (gap <= ENGAGEMENT_H + 0.5) {
        // nearly every model has *some* melee weapon, so "has one at all" barely ever gates this — compare the
        // actual trade instead: losing the melee exchange badly (in value terms) means leave regardless
        const losingTrade = ranged && enemy
          ? unitMeleeDamage(state, enemy.unitId, unitId, {}) * unitValue(state, enemy.unitId)
            > unitMeleeDamage(state, unitId, enemy.unitId, {}) * unitValue(state, unitId) * 1.2
          : false
        if (!melee || losingTrade) s += 3.5
        // GLO-BT-1: a free Retreat followed by a charge is a fresh Charge and Strike-first for nothing
        else if (retreatsAndCharges(state, unitId)) s += 4
        // STD-RA-2 Fearless Invaders is sworn as the Retreat is declared: free and the unit charges again, which pays for a
        // unit whose weapons hit harder on the charge, or one losing its fight
        else if (enemy && slavesFreeRetreatAvailable(state, player) && (hasChargeBonus(state, unitId)
          || unitMeleeDamage(state, enemy.unitId, unitId, {}) * unitValue(state, enemy.unitId) > unitMeleeDamage(state, unitId, enemy.unitId, {}) * unitValue(state, unitId) * 1.2)) s += 4
      }
      return s
    }
    default:
      return 0
  }
}

function scoreDeclareTargets(state: GameState, pending: PendingDecision, action: DeclareTargetsAction): number {
  if (pending.kind !== 'declareTargets') return 0
  if (action.targets.length === 0) return 0.5
  const groups = new Map<UnitId, { modelId: string; weaponId: string; attacks: number | null }[]>()
  for (const t of action.targets) {
    const arr = groups.get(t.targetUnitId) ?? []
    arr.push({ modelId: t.modelId, weaponId: t.weaponId, attacks: t.attacks ?? null })
    groups.set(t.targetUnitId, arr)
  }
  const attackerUnit = state.units[pending.context.unitId]
  const charged = attackerUnit?.turn.chargedThisTurn ?? false
  let total = 0
  for (const [targetUnitId, assigns] of groups) {
    const target = state.units[targetUnitId]
    if (!target) continue
    const dmg = sumExpectedAttacks(state, assigns.map((a) => ({ ...a, targetUnitId })), { charged })
    const val = unitValue(state, targetUnitId)
    const totalWounds = unitModels(state, targetUnitId).reduce((s, m) => s + m.woundsRemaining, 0)
    let mult = 1
    if (totalWounds > 0 && dmg >= totalWounds) mult += 0.6 // likely finishes the unit
    if (target.models.length < target.startingStrength) mult += 0.2 // already wounded — finish it
    // in the fight phase a unit that has not fought yet and is about to lose models hits back with fewer of them
    if (state.phase === 'fight' && target.player !== pending.player && !target.turn.foughtThisPhase && totalWounds > 0) mult += 0.5 * Math.min(1, dmg / totalWounds)
    if (Object.values(state.objectives).some((o) => !o.removed && unitModels(state, targetUnitId).some((m) => withinObjectiveRange(m, o)))) mult += 0.3
    total += dmg * val * 0.02 * mult
    // killing the models that keep the enemy on a circle can hand the circle over (or stop it being taken)
    if (totalWounds > 0 && target.player !== pending.player) {
      const share = Math.min(1, dmg / totalWounds)
      total += Math.max(0, objectiveVp(state, pending.player, { removed: { unitId: targetUnitId, share } }) - objectiveVp(state, pending.player)) * VP_W * 0.3
    }
  }
  return total
}


function scoreChooseUnitToActivate(state: GameState, player: PlayerId, pending: PendingDecision, action: Action): number {
  // Spearhead charges have no declare step (CORE-9.4): picking the unit in the charge phase IS the charge, so the charge
  // trade is judged here and passing ends the phase once nothing left is worth the dice
  const charging = pending.kind === 'chooseUnitToActivate' && pending.context.phase === 'charge'
  if (action.type === 'pass') return charging ? CHARGE_PASS : -1000
  if (action.type !== 'chooseUnitToActivate' || pending.kind !== 'chooseUnitToActivate') return 0
  const unitId = action.unitId
  if (charging) {
    const targets = boardUnitsOf(state, other(player)).map((u) => u.id).filter((id) => minGapBetweenUnits(state, unitId, id) <= 12.5)
    return scoreDeclareCharge(state, player, pending, { type: 'declareCharge', player, decisionId: pending.id, unitId, targetUnitIds: targets } as DeclareChargeAction)
  }
  if (pending.context.phase === 'shooting') {
    let best = 0
    for (const enemy of boardUnitsOf(state, other(player))) best = Math.max(best, unitRangedDamage(state, unitId, enemy.id) * unitValue(state, enemy.id) * 0.02)
    return best + unitValue(state, unitId) * 0.001
  }
  // faction hint: a Frigate with a Company beside it moves first, before the Company walks out of ride range
  return unitValue(state, unitId) + (pending.context.phase === 'movement' ? kharadronActivationBonus(state, player, unitId) ?? 0 : 0)
}

function scoreChooseFightUnit(state: GameState, player: PlayerId, action: Action): number {
  if (action.type === 'pass') return -1000
  if (action.type !== 'chooseFightUnit') return 0
  const unitId = action.unitId
  const myModels = unitModels(state, unitId)
  const charged = state.units[unitId]?.turn.chargedThisTurn ?? false
  let best = 0
  let incoming = 0
  for (const enemy of boardUnitsOf(state, other(player))) {
    const theirModels = unitModels(state, enemy.id)
    let engaged = false
    for (const a of myModels) { for (const b of theirModels) if (withinEngagementRange(a, b)) { engaged = true; break } ; if (engaged) break }
    if (!engaged) continue
    best = Math.max(best, unitMeleeDamage(state, unitId, enemy.id, { charged }) * unitValue(state, enemy.id) * 0.02)
    // what the enemy units that have yet to fight could do to it first: a unit likely to be cut down before it strikes goes now
    if (!enemy.turn.foughtThisPhase) incoming += unitMeleeDamage(state, enemy.id, unitId, {})
  }
  const wounds = myModels.reduce((a, m) => a + m.woundsRemaining, 0)
  return wounds > 0 ? best * (1 + 1.5 * Math.min(1, incoming / wounds)) : best
}

// ---- formation deployment / arrival (shape generators: src/ai/formations.ts) ----
function formationRole(state: GameState, unitId: UnitId, n: number): FormationRole {
  const unit = state.units[unitId]
  if (n <= 1) return 'solo'
  if (unit.attachedLeaderId) return 'leaderBlock'
  const ranged = hasAnyRangedWeapon(state, unitId)
  const range = ranged ? bestRangedRangeOfUnit(state, unitId) : null
  if (!ranged || (range !== null && range <= 12)) return 'melee'
  return 'ranged'
}

// A shallow zone (~5" deep) fills up with big oval bases (Gitz wolf riders and Wheelas, Fellriders): pack them flush against a zone
// side or a friendly unit, so the free space stays one stretch wide enough for the next unit. Up to +2.5, nothing from 2" off.
function packingBonus(feet: Footprint[], axis: 'x' | 'z', lo: number, hi: number, friends: Footprint[]): number {
  const reach = (f: Footprint): number => Math.max(f.base.radius, f.base.radius2 ?? 0)
  const along = (f: Footprint): number => (axis === 'x' ? f.pos.x : f.pos.z)
  const across = (f: Footprint): number => (axis === 'x' ? f.pos.z : f.pos.x)
  const fl = Math.min(...feet.map((f) => along(f) - reach(f))), fr = Math.max(...feet.map((f) => along(f) + reach(f)))
  let gapL = fl - lo, gapR = hi - fr
  for (const m of friends) {
    if (!feet.some((f) => Math.abs(across(f) - across(m)) < reach(f) + reach(m))) continue // not in the same strip
    if (along(m) + reach(m) <= fl + 1e-6) gapL = Math.min(gapL, fl - (along(m) + reach(m)))
    else if (along(m) - reach(m) >= fr - 1e-6) gapR = Math.min(gapR, along(m) - reach(m) - fr)
  }
  return 2.5 * (1 - Math.min(Math.max(0, Math.min(gapL, gapR)), 2) / 2)
}

// F13: a unit arriving from reserve ("set up anywhere, more than 6" from every enemy": Chameleon Ambush, Swoop Down, the Brutes)
// is worth what it can hit from the spot this turn: a shooter's best target within its range, a melee unit's best charge weighted
// by the odds of the dice. Without it the bot set its ambushers down at home, out of range of everything. A spot inside the
// set-up exclusion (minGap) is refused here (null) so the short list the caller validates is not all illegal spots.
function arrivalStrike(state: GameState, player: PlayerId, unitId: UnitId, feet: Footprint[], minGap: number): number | null {
  const gaps = new Map<UnitId, number>()
  for (const m of boardModelsOf(state, other(player))) {
    const mr = Math.max(m.base.radius, m.base.radius2 ?? 0)
    for (const f of feet) {
      const gap = Math.hypot(f.pos.x - m.pos.x, f.pos.z - m.pos.z) - Math.max(f.base.radius, f.base.radius2 ?? 0) - mr
      if (minGap > 0 && gap <= minGap + 0.05) return null
      if (gap < (gaps.get(m.unitId) ?? Infinity)) gaps.set(m.unitId, gap)
    }
  }
  const range = hasAnyRangedWeapon(state, unitId) ? (bestRangedRangeOfUnit(state, unitId) ?? 0) : 0
  const melee = hasAnyMeleeWeapon(state, unitId) && !isGunline(state, unitId)
  let dice = 2
  try { dice = chargeDiceCount(state, unitId) } catch { /* not on the table yet: plain 2D6 */ }
  let best = 0
  for (const [e, gap] of gaps) {
    const wounds = unitModels(state, e).reduce((a, x) => a + x.woundsRemaining, 0)
    if (wounds <= 0) continue
    const value = unitValue(state, e)
    if (range > 0 && gap <= range) {
      const dmg = Math.min(wounds, unitRangedDamage(state, unitId, e))
      best = Math.max(best, 3 + dmg * value * 0.01)
    }
    if (melee && gap <= 12) {
      const p = chargeProb(Math.max(2, Math.ceil(gap - 0.5)), dice)
      const dmg = Math.min(wounds, unitMeleeDamage(state, unitId, e, { charged: true }))
      best = Math.max(best, p * (2 + dmg * value * 0.01))
    }
  }
  return Math.min(best, 10)
}

function chooseFormationDeployment(state: GameState, player: PlayerId, pending: Extract<PendingDecision, { kind: 'deployUnit' }>, rng: Rng): DeployUnitAction | null {
  const arrival = state.phase !== 'setup' && state.phase !== 'deployment'
  const zone = pending.constraints.region ?? pending.context.zone
  if (zone.length < 3) return null
  const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const enemyBoard = boardModelsOf(state, other(player))
  let enemyC = { x: 0, z: 0 }
  if (enemyBoard.length > 0) enemyC = placementsCenter(enemyBoard.map((m) => ({ modelId: m.id, pos: m.pos })))
  else { try { enemyC = polyCentroid(deploymentZone(state, other(player))) } catch { /* sides unset */ } }
  const objs = Object.values(state.objectives).filter((o) => !o.removed)
  // candidate units: setup drops one unit at a time (an attached Leader rides with its bodyguard); an arrival is one group answer
  const groups: { unitId: UnitId; models: FormationModel[]; reserve: boolean }[] = []
  if (arrival) {
    const models = pending.context.unitIds.flatMap((id) => (state.units[id] ? unitModels(state, id) : []))
    groups.push({ unitId: pending.context.unitIds[0], models: models.map((m) => ({ id: m.id, base: m.base })), reserve: false })
  } else {
    for (const id of pending.context.unitIds) {
      const u = state.units[id]
      if (!u || u.bodyguardUnitId) continue
      const own = unitModels(state, id)
      const lead = u.attachedLeaderId && state.units[u.attachedLeaderId] ? unitModels(state, u.attachedLeaderId) : []
      groups.push({ unitId: id, models: [...own, ...lead].map((m) => ({ id: m.id, base: m.base })), reserve: pending.context.reservesAllowed.includes(id) })
    }
  }
  if (groups.length === 0) return null
  // a shallow zone (Spearhead: ~5" deep) runs out of room if small units go down first and sprawl: deploy the unit with
  // the biggest footprint (sum of base areas) first, so the long single ranks of mounted units still find a free stretch
  if (!arrival && groups.length > 1 && Math.min(maxX - minX, maxZ - minZ) < 8) {
    const area = (g: { unitId: UnitId; models: FormationModel[] }): number => g.models.reduce((s, m) => s + Math.PI * m.base.radius * (m.base.radius2 ?? m.base.radius), 0)
    let biggest = groups[0]
    for (const g of groups) if (area(g) > area(biggest)) biggest = g
    groups.splice(0, groups.length, biggest)
  }
  const myReserves = Object.values(state.units).filter((u) => u.player === player && u.location === 'reserves').length
  const xStep = 2.5, zStep = 1 // a Combat Patrol zone is only ~5" deep: fine in z so a 2-3 rank block can sit anywhere in it
  const occupied: Footprint[] = [...boardModelsOf(state, player), ...enemyBoard]
  const friendsOnTable: Footprint[] = boardModelsOf(state, player)
  const threats = threatSources(state, player)
  type Cand = { action: DeployUnitAction; score: number }
  const cands: Cand[] = []
  for (const g of groups) {
    if (g.models.length === 0) continue
    const role = formationRole(state, g.unitId, g.models.length)
    const heavy = g.models.length === 1 || hasKeyword(state, g.unitId, 'VEHICLE') || hasKeyword(state, g.unitId, 'MONSTER')
    // heavy multi-model units use a block, but a shallow zone needs the one-rank line / zig-zag as well
    let shapes: FormationShape[] = heavy && g.models.length > 1 ? ['block', 'line'] : shapesForRole(role, g.models.length)
    const stats = modelStats(state, unitModels(state, g.unitId)[0])
    const rangeOf = hasAnyRangedWeapon(state, g.unitId) ? bestRangedRangeOfUnit(state, g.unitId) : null
    // only cheap (1 W, 5+ or worse save), short-ranged mobs are screening-line material
    if (g.models.length >= 8 && stats.W === 1 && stats.Sv >= 5 && (rangeOf === null || rangeOf <= 18) && !heavy) shapes = [...shapes, 'line']
    const meleeOnly = hasAnyMeleeWeapon(state, g.unitId) && !hasAnyRangedWeapon(state, g.unitId)
    const gun = !arrival && isGunline(state, g.unitId)
    const gunRange = gun ? (bestRangedRangeOfUnit(state, g.unitId) ?? 0) : 0
    // a long oval base (Rockgrinder, 150x90 mm) is deeper than a 5" zone when it faces the enemy: also try it side-on
    const oval = g.models.some((m) => m.base.radius2 !== undefined && Math.abs(m.base.radius - m.base.radius2) > 0.2)
    let unitBest = -Infinity
    let bestBoxed = false // the best spot so far leaves a fast unit no slide out (deployLaneBlock: 5+ of 6 slides blocked)
    // a faction hint that wants a precise spot (a Kharadron Company beside the Frigate) also gets the fine second pass
    const fromReserves = arrival && state.units[g.unitId]?.location === 'reserves'
    const hinted = !arrival && kharadronDeployBonus(state, player, g.unitId, g.models.map((m) => ({ pos: { x: 0, y: 0, z: 0 }, facing: 0, base: m.base }))) !== null
    // pass 0: the preferred shapes on a coarse grid; pass 1 (only when nothing fit, e.g. a crowded 5" zone, or a fast unit would be
    // boxed in): every shape, a fine grid, side-on facings
    for (let pass = 0; pass < 2 && (unitBest === -Infinity || (pass === 1 && (bestBoxed || hinted))); pass++) {
    const passShapes: FormationShape[] = pass === 0 ? shapes : ['line', 'block', 'phalanx', 'wedge', 'checker']
    for (let z = minZ + 0.5; z <= maxZ - 0.5 + 1e-9; z += zStep) {
      for (let x = minX + 0.5; x <= maxX - 0.5 + 1e-9; x += pass === 0 ? xStep : 0.25) {
        if (!pointInPolygon({ x, z }, zone)) continue
        const toEnemy = Math.atan2(enemyC.z - z, enemyC.x - x)
        const facings = pass === 1 ? [toEnemy, toEnemy + Math.PI / 2, toEnemy - Math.PI / 2] : oval ? [toEnemy, toEnemy + Math.PI / 2] : [toEnemy]
        let nearObj: { x: number; z: number } | null = null, nd = Infinity
        for (const o of objs) { const d = Math.hypot(o.pos.x - x, o.pos.z - z); if (d < nd) { nd = d; nearObj = o.pos } }
        if (nearObj && nd > 3) {
          const fo = Math.atan2(nearObj.z - z, nearObj.x - x)
          if (Math.abs(Math.atan2(Math.sin(fo - toEnemy), Math.cos(fo - toEnemy))) > 0.35) facings.push(fo)
        }
        const dEnemy = Math.hypot(enemyC.x - x, enemyC.z - z)
        const inTerrain = Object.values(state.board.pieces).some((pc) => pointInPolygon({ x, z }, pc.footprint))
        for (const shape of passShapes) {
          for (const facing of facings) {
            const placements = buildFormation(shape, g.models, { x, z }, facing)
            if (!placements) continue
            const feet = placements.map((p, i) => ({ pos: p.pos, facing, base: g.models[i].base }))
            if (!feet.every((f) => whollyWithinPolygon(f, zone) && whollyOnBoard(f, state.board) && !occupied.some((o) => basesOverlap(f, o)))) continue
            // never set up boxed in by terrain (a VEHICLE inside ruin walls it can never cross)
            if (!feet.every((f, i) => { const m = state.models[g.models[i].id]; return !m || deployTerrainBlock(state, m, f.pos, f.facing) === null })) continue
            const action: DeployUnitAction = { type: 'deployUnit', player, decisionId: pending.id, unitId: g.unitId, placements }
            let score = scoreDeployUnit(state, player, action, threats) + shapeRoleScore(shape === 'line' ? 'screen' : role, shape)
            // faction hint: Kharadron Companies set up within ride range of the Frigate (Ply the Skies)
            score += kharadronDeployBonus(state, player, g.unitId, feet) ?? 0
            const lanes = deployLaneBlock(state, player, placements, toEnemy)
            score -= lanes.own * (stats.M >= 8 ? 0.9 : 0.3) + lanes.others * 0.8
            if (gun) score += Math.min(dEnemy, 36) * 0.05 + fireLanes(state, player, { x, z }, gunRange)
            else if (role === 'ranged') { score += Math.min(dEnemy, 36) * 0.03; if (inTerrain) score += 0.8 }
            else if (role === 'melee' && !meleeOnly) score += Math.max(0, 36 - dEnemy) * 0.02
            if (arrival && role !== 'ranged') score += Math.max(0, 24 - dEnemy) * 0.05
            if (fromReserves) {
              const strike = arrivalStrike(state, player, g.unitId, feet, pending.constraints.minDistanceFromEnemies ?? 0)
              if (strike === null) continue
              score += strike
            }
            if (oval && !arrival && Math.min(maxX - minX, maxZ - minZ) < 8) {
              const lateral = maxX - minX >= maxZ - minZ ? 'x' as const : 'z' as const
              score += packingBonus(feet, lateral, lateral === 'x' ? minX : minZ, lateral === 'x' ? maxX : maxZ, friendsOnTable)
            }
            score += rng.next() * 0.6
            cands.push({ action, score })
            if (score > unitBest) { unitBest = score; bestBoxed = stats.M >= 8 && lanes.own >= 5 }
          }
        }
      }
    }
    }
    // Deep Strike: at most one unit held back per player at setup, only when the placed options are unremarkable
    if (!arrival && g.reserve && myReserves === 0 && role !== 'solo' && unitBest > -Infinity && !hasKeyword(state, g.unitId, 'CHARACTER')) {
      cands.push({ action: { type: 'deployUnit', player, decisionId: pending.id, unitId: g.unitId, placements: [], toReserves: true }, score: unitBest - 1.5 + 2 * rng.next() * (role === 'melee' ? 1 : 0.5) })
    }
  }
  cands.sort((a, b) => b.score - a.score)
  for (const c of cands.slice(0, 80)) if (validate(state, c.action) === null) return c.action
  return null
}

// how boxed in a deployment spot is: the whole unit slid 3" and 6" ahead (straight at the enemy and 45 degrees either side), each
// slide counted as blocked when a model would end off the board, on a friendly model already set up, or inside terrain it cannot
// stand in. A fast unit parked between a slow block, a war machine and a wall can never get out (every move the engine offers is
// a slide like these), so the cavalry must keep its lanes open.
function deployLaneBlock(state: GameState, player: PlayerId, placements: ModelPlacement[], toEnemy: number): { own: number; others: number } {
  const friends = boardModelsOf(state, player)
  const hw = state.board.w / 2, hh = state.board.h / 2
  const slides: { x: number; z: number }[] = []
  for (const da of [0, Math.PI / 4, -Math.PI / 4]) for (const d of [3, 6]) slides.push({ x: Math.cos(toEnemy + da) * d, z: Math.sin(toEnemy + da) * d })
  let blocked = 0
  for (const v of slides) {
    const stuck = placements.some((p) => {
      const m = state.models[p.modelId]
      if (!m) return false
      const pos = { x: p.pos.x + v.x, y: p.pos.y, z: p.pos.z + v.z }
      const r = Math.max(m.base.radius, m.base.radius2 ?? 0)
      if (Math.abs(pos.x) > hw - r || Math.abs(pos.z) > hh - r) return true
      const foot = { pos, facing: p.facing ?? m.facing, base: m.base }
      if (friends.some((f) => basesOverlap(foot, f))) return true
      return deployTerrainBlock(state, m, pos, foot.facing) !== null
    })
    if (stuck) blocked++
  }
  // and the other way round: standing straight in front of a fast unit that is already set up (a unit beside it is fine: it
  // still has its straight slides, and a passenger next to a transport is where it wants to be)
  let others = 0
  for (const u of boardUnitsOf(state, player)) {
    const ms = unitModels(state, u.id)
    if (ms.length === 0 || modelStats(state, ms[0]).M < 8) continue
    for (const v of slides.slice(0, 2)) {
      if (ms.some((m) => placements.some((q) => { const mm = state.models[q.modelId]; return !!mm && basesOverlap({ pos: { x: m.pos.x + v.x, y: m.pos.y, z: m.pos.z + v.z }, facing: m.facing, base: m.base }, { pos: q.pos, facing: q.facing ?? mm.facing, base: mm.base }) }))) others++
    }
  }
  return { own: blocked, others }
}

// a war machine's deployment: how many objectives and enemy set-up spots it could fire at from here without a wall in the way
function fireLanes(state: GameState, player: PlayerId, at: { x: number; z: number }, range: number): number {
  if (range <= 0) return 0
  const from = { x: at.x, y: 1.2, z: at.z }
  let lanes = 0
  const look = (p: { x: number; z: number }, w: number): void => {
    if (Math.hypot(p.x - at.x, p.z - at.z) > range) return
    if (terrainLineClear(state, from, { x: p.x, y: 0.8, z: p.z })) lanes += w
  }
  for (const o of Object.values(state.objectives)) if (!o.removed) look(o.pos, 1)
  const enemyModels = boardModelsOf(state, other(player))
  if (enemyModels.length > 0) for (const m of enemyModels) look(m.pos, 0.3)
  else {
    try { for (const p of deploymentZone(state, other(player))) look({ x: (p.x * 2 + at.x) / 3, z: (p.z * 2 + at.z) / 3 }, 0.3) } catch { /* sides unset */ }
  }
  return lanes * 0.8
}

// Charge: no targets are declared in Spearhead (CORE-9.4), so the bot weighs the nearest candidate it could reach.
const CHARGE_PASS = 0.3

function scoreDeclareCharge(state: GameState, player: PlayerId, pending: PendingDecision, action: DeclareChargeAction | { type: 'pass' }): number {
  if (action.type === 'pass') return CHARGE_PASS
  const unitId = action.unitId
  const targets = action.targetUnitIds.length > 0 ? action.targetUnitIds : pending.kind === 'declareCharge' ? pending.context.candidateTargets : []
  if (targets.length === 0) return 0.4
  // a gunline unit stuck in combat cannot shoot next turn (CORE-8.3) unless its gun has Shoot in Combat: it does not charge
  if (isGunline(state, unitId) && !unitModels(state, unitId).some((m) => m.weapons.some((w) => state.weapons[w]?.kind === 'ranged' && state.weapons[w].abilities.some((a) => a.ability === 'SHOOT_IN_COMBAT')))) return -2
  const isLoneHero = hasKeyword(state, unitId, 'HERO') && unitModels(state, unitId).length <= 1
  const riskMult = (isLoneHero ? 1.3 : 1.0) * expendable(state, unitId, 0.6)
  // a unit standing on an objective risks charging off it; it needs a clearly good trade to go (unless the target is on
  // that same marker: then the charge keeps it there)
  const myObjectives = Object.values(state.objectives).filter((o) => !o.removed && unitModels(state, unitId).some((m) => withinObjectiveRange(m, o)))
  let best = -Infinity
  // after the charge, does this unit strike first (For Sigmar, Charge!, Unleashed Rage)? Then what it kills cannot hit back
  const unit = state.units[unitId]
  const charged = { ...state, units: { ...state.units, [unitId]: { ...unit, turn: { ...unit.turn, chargedThisTurn: true } } } } as GameState
  const strikeFirst = !!DEFAULT_SERVICES.hooks.eligibilityFor?.(charged, unitId, 'fightFirst')
  const reroll = hasChargeReroll(state, unitId)
  // what the unit's Control on the circle it stands on is worth at the end of this turn (lost if it charges off it)
  const leaveCost = myObjectives.length > 0 ? Math.max(0, objectiveVp(state, player) - objectiveVp(state, player, { unitId, placements: [] })) * VP_W * 0.25 : 0
  for (const targetId of targets) {
    const gap = minGapBetweenUnits(state, unitId, targetId)
    const needed = Math.max(0, gap - 0.5)
    const dmg = unitMeleeDamage(state, unitId, targetId, { charged: true })
    const wounds = unitModels(state, targetId).reduce((a, m) => a + m.woundsRemaining, 0)
    let ret = unitMeleeDamage(state, targetId, unitId, {})
    if (strikeFirst && wounds > 0) ret *= Math.max(0, 1 - dmg / wounds)
    // the enemy swings at this unit sooner or later whether it charges or not: only part of the return blow is the charge's
    // cost, and a smaller part when the target is already locked with a friend or could charge this unit next turn anyway
    const tm = unitModels(state, targetId)[0]
    const theirReach = tm ? modelStats(state, tm).M + 7 : 0
    const comesAnyway = engagedEnemyUnits(state, other(player), targetId).length > 0 || gap <= theirReach
    const retShare = finalTurnOf(state, player) ? 0.15 : comesAnyway ? 0.45 : 0.7
    let payoff = dmg * unitValue(state, targetId) * 0.02 - ret * unitValue(state, unitId) * 0.02 * riskMult * retShare
    payoff += chargeObjectiveSwing(state, player, unitId, targetId, dmg, wounds)
    let p = chargeProb(Math.ceil(needed), chargeDiceCount(state, unitId))
    if (reroll) p = 1 - (1 - p) * (1 - p)
    let s = p * payoff - (1 - p) * 0.4
    if (myObjectives.length > 0 && !myObjectives.some((o) => unitModels(state, targetId).some((m) => withinObjectiveRange(m, o)))) s -= 0.6 + leaveCost
    best = Math.max(best, s)
  }
  return best
}

// a charge into a unit that is contesting a marker the enemy holds (or threatens to take) also fights for that marker: our
// models land on it, and if the target dies the marker usually changes hands
function chargeObjectiveSwing(state: GameState, player: PlayerId, unitId: UnitId, targetId: UnitId, dmg: number, wounds: number): number {
  let swing = 0
  const theirs = unitModels(state, targetId)
  for (const o of Object.values(state.objectives)) {
    if (o.removed || !theirs.some((m) => withinObjectiveRange(m, o))) continue
    const ctl = DEFAULT_SERVICES.objectives.controller(state, o.id)
    const w = objectiveScoreWeight(state, player, o.id) / 2.5
    const kill = wounds > 0 ? Math.min(1, dmg / wounds) : 0
    swing = Math.max(swing, w * ((ctl === player ? 1.4 : 0.9) + 1.6 * kill))
  }
  // even off-objective, finishing a unit off is worth something beyond its value (one fewer body to contest later)
  if (swing === 0 && wounds > 0 && dmg >= wounds * 0.9) swing = 0.5
  return unitValue(state, unitId) > 0 ? swing : 0
}

// would this unit have Strike-first once it has charged this turn (state-only probe, as scoreDeclareCharge does)
function strikesFirstOnCharge(state: GameState, unitId: UnitId): boolean {
  const unit = state.units[unitId]
  if (!unit) return false
  const charged = { ...state, units: { ...state.units, [unitId]: { ...unit, turn: { ...unit.turn, chargedThisTurn: true } } } } as GameState
  return !!DEFAULT_SERVICES.hooks.eligibilityFor?.(charged, unitId, 'fightFirst')
}

// some melee weapon of the unit is better on the charge (Charge (+1 Damage))
function hasChargeBonus(state: GameState, unitId: UnitId): boolean {
  return unitModels(state, unitId).some((m) => m.weapons.some((w) => state.weapons[w]?.kind === 'melee' && state.weapons[w].abilities.some((a) => a.ability === 'CHARGE_DAMAGE')))
}

// a granted charge re-roll (Champion of Raids and the like) on this unit this turn
function hasChargeReroll(state: GameState, unitId: UnitId): boolean {
  const unit = state.units[unitId]
  if (!unit) return false
  return unit.effects.some((e) => {
    if (state.abilities[e.sourceAbilityId]?.code !== 'slavesChampionOfRaids') return false
    return (Array.isArray(e.effect) ? e.effect : [e.effect]).some((x) => x.reroll !== undefined)
  })
}

const CARD_TOPICS: ReadonlySet<string> = new Set(['twistPick', 'discardTactics', 'scoreTactics', 'tacticCommand'])

const DECLINE = /^(pass|decline|skip|none|no|keep|cancel)\b/i

function scoreChooseOption(state: GameState, player: PlayerId, pending: PendingDecision, action: Action): number {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return 0
  const option = pending.options.find((o) => o.action.type === 'chooseOption' && o.action.optionId === action.optionId)
  const hint = (option?.hint ?? {}) as Record<string, unknown>
  let score = 0
  if (typeof hint.vp === 'number') score += hint.vp * 5
  if (typeof hint.value === 'number') score += hint.value
  if (typeof hint.priority === 'number') score += hint.priority
  const hintUnitId = typeof hint.unitId === 'string' ? (hint.unitId as UnitId) : null
  const topic = pending.context.topic
  const declining = DECLINE.test(action.optionId) || DECLINE.test(option?.label ?? '')
  switch (topic) {
    case 'firstTurn':
    case 'priorityChoice':
      // going first is worth more than going second: take the turn for ourselves
      return action.optionId === player ? 2 : 0
    case 'abilityUse':
      // an offered ability is worth using; passing ends the window
      if (declining) return -1
      return 1 + (hintUnitId && state.units[hintUnitId] ? unitValue(state, hintUnitId) * 0.001 : 0) + abilityTiming(state, player, action.optionId.split('#')[0], hintUnitId)
    case 'abilityTarget':
    case 'pileInTarget': {
      // a target is always better than backing out: pick the most valuable unit (friendly buffs and enemy debuffs alike)
      const unitId = hintUnitId ?? (state.units[action.optionId] ? action.optionId : null)
      if (unitId && state.units[unitId]) return 1 + unitValue(state, unitId) * 0.03 + abilityTargetBonus(state, player, pending, unitId)
      return declining ? -1 : 0.5
    }
    case 'abilityMode':
      return declining ? -1 : 0.5 + abilityModeBonus(state, pending, action.optionId)
    case 'contestedObjective': {
      const o = state.objectives[action.optionId]
      return o ? objectiveScoreWeight(state, player, o.id) : 0
    }
    default:
      break
  }
  if (hintUnitId && state.units[hintUnitId]) score += unitValue(state, hintUnitId) * 0.03
  if (declining) score -= 1
  return score
}

const contestsObjective = (state: GameState, unitId: UnitId): boolean =>
  Object.values(state.objectives).some((o) => !o.removed && unitModels(state, unitId).some((m) => withinObjectiveRange(m, o)))

// the unit an ability being declared has picked (abilities.ts keeps the selection in a phase mark keyed by the window key)
function selectedAbilityTarget(state: GameState, pending: PendingDecision): UnitId | null {
  const k = ((pending as { context?: { data?: { k?: unknown } } }).context?.data?.k)
  if (typeof k !== 'string') return null
  const prefix = `abil:sel:${k}=`
  const mark = state.phaseState.marks.find((m) => m.startsWith(prefix))
  if (!mark) return null
  try { return (JSON.parse(mark.slice(prefix.length)) as { target?: UnitId }).target ?? null } catch { return null }
}

// when an offered ability is better saved: added to the "use it" score (1 + a hair); below -2 the bot passes instead.
// Most abilities are worth using whenever offered; the once-per-battle buffs and the charge helpers are not.
function abilityTiming(state: GameState, player: PlayerId, abilityId: string, unitId: UnitId | null): number {
  const code = state.abilities[abilityId]?.code
  const kruTiming = code?.startsWith('kruleboyz') ? kruleboyzAbilityTiming(state, player, code, unitId) : null
  if (kruTiming !== null) return kruTiming
  const gloTiming = code?.startsWith('gloomspite') ? gloomspiteAbilityTiming(state, player, code, unitId) : null
  if (gloTiming !== null) return gloTiming
  const koTiming = code?.startsWith('kharadron') ? kharadronAbilityTiming(state, player, code, unitId) : null
  if (koTiming !== null) return koTiming
  const sbgTiming = code?.startsWith('soulblight') ? soulblightAbilityTiming(state, player, code, unitId) : null
  if (sbgTiming !== null) return sbgTiming
  const sceTiming = code?.startsWith('stormcast') ? stormcastAbilityTiming(state, player, code, unitId) : null
  if (sceTiming !== null) return sceTiming
  const nurTiming = code?.startsWith('nurgle') ? nurgleAbilityTiming(state, player, code, unitId) : null
  if (nurTiming !== null) return nurTiming
  const skvTiming = code?.startsWith('skaven') ? skavenAbilityTiming(state, player, code, unitId) : null
  if (skvTiming !== null) return skvTiming
  const bokTiming = code?.startsWith('khorne') ? khorneAbilityTiming(state, player, code, unitId) : null
  if (bokTiming !== null) return bokTiming
  const serTiming = code?.startsWith('seraphon') ? seraphonAbilityTiming(state, player, code, unitId) : null
  if (serTiming !== null) return serTiming
  const sylTiming = code?.startsWith('sylvaneth') ? sylvanethAbilityTiming(state, player, code, unitId) : null
  if (sylTiming !== null) return sylTiming
  const nhTiming = code?.startsWith('nighthaunt') ? nighthauntAbilityTiming(state, player, code, unitId) : null
  if (nhTiming !== null) return nhTiming
  if (code === 'fyreslayersPlantTheIcon') {
    // once per battle, Ward for one turn: wait for the turn the units around the Battlesmith are actually fighting
    const src = unitId ? centerOfUnit(state, unitId) : null
    if (!src) return 0
    let busy = 0
    for (const u of boardUnitsOf(state, player)) {
      const c = centerOfUnit(state, u.id)
      if (!c || Math.hypot(c.x - src.x, c.z - src.z) > 12) continue
      const near = nearestEnemyUnit(state, player, u.id)
      if (near && near.gap <= (state.activePlayer === player ? ENGAGEMENT_H + 0.5 : 12)) busy++
    }
    if (busy >= 2 || (busy >= 1 && state.round >= 4)) return 1
    return -3
  }
  if (code === 'slavesChampionOfRaids') {
    // only worth it when another unit has a charge to make (not in combat, an enemy within 12")
    const has = boardUnitsOf(state, player).some((u) => {
      if (u.id === unitId || engagedEnemyUnits(state, player, u.id).length > 0) return false
      const near = nearestEnemyUnit(state, player, u.id)
      return !!near && near.gap > ENGAGEMENT_H && near.gap <= 12.5
    })
    return has ? 0 : -3
  }
  return 0
}

// the charge the unit could make right now and how much a re-roll of the charge roll adds to it
function chargeRerollGain(state: GameState, player: PlayerId, unitId: UnitId): number {
  if (engagedEnemyUnits(state, player, unitId).length > 0 || !hasAnyMeleeWeapon(state, unitId)) return 0
  let best = 0
  for (const e of boardUnitsOf(state, other(player))) {
    const gap = minGapBetweenUnits(state, unitId, e.id)
    if (gap <= ENGAGEMENT_H || gap > 6 * chargeDiceCount(state, unitId) + 0.5) continue
    const p = chargeProb(Math.ceil(Math.max(0, gap - 0.5)), chargeDiceCount(state, unitId))
    const gain = (1 - (1 - p) * (1 - p)) - p
    best = Math.max(best, gain * (unitMeleeDamage(state, unitId, e.id, { charged: true }) * unitValue(state, e.id) * 0.02 + 1))
  }
  return best
}

// what makes one target better than another for the abilities whose value is not just "the biggest unit"
function abilityTargetBonus(state: GameState, player: PlayerId, pending: PendingDecision, unitId: UnitId): number {
  const abilityId = (pending as { context?: { abilityId?: string | null } }).context?.abilityId
  const code = abilityId ? state.abilities[abilityId]?.code : undefined
  const unit = state.units[unitId]
  if (!unit) return 0
  const kruBonus = code?.startsWith('kruleboyz') ? kruleboyzTargetBonus(state, player, code, unitId) : null
  if (kruBonus !== null) return kruBonus
  const koBonus = code?.startsWith('kharadron') ? kharadronTargetBonus(state, player, code, unitId) : null
  if (koBonus !== null) return koBonus
  const sbgBonus = code?.startsWith('soulblight') ? soulblightTargetBonus(state, player, code, unitId) : null
  if (sbgBonus !== null) return sbgBonus
  const sceBonus = code?.startsWith('stormcast') ? stormcastTargetBonus(state, player, code, unitId) : null
  if (sceBonus !== null) return sceBonus
  const nurBonus = code?.startsWith('nurgle') ? nurgleTargetBonus(state, player, code, unitId) : null
  if (nurBonus !== null) return nurBonus
  const skvBonus = code?.startsWith('skaven') ? skavenTargetBonus(state, player, code, unitId) : null
  if (skvBonus !== null) return skvBonus
  const bokBonus = code?.startsWith('khorne') ? khorneTargetBonus(state, player, code, unitId) : null
  if (bokBonus !== null) return bokBonus
  const serBonus = code?.startsWith('seraphon') ? seraphonTargetBonus(state, player, code, unitId) : null
  if (serBonus !== null) return serBonus
  const sylBonus = code?.startsWith('sylvaneth') ? sylvanethTargetBonus(state, player, code, unitId) : null
  if (sylBonus !== null) return sylBonus
  const nhBonus = code?.startsWith('nighthaunt') ? nighthauntTargetBonus(state, player, code, unitId) : null
  if (nhBonus !== null) return nhBonus
  if (code === 'citiesIronweldDiscipline') {
    // the Cannon fires at it: expected damage, not size
    let best = 0
    for (const u of boardUnitsOf(state, player)) if (isGunline(state, u.id)) best = Math.max(best, unitRangedDamage(state, u.id, unitId, { inRangeOnly: true }) * unitValue(state, unitId) * 0.02)
    return best * 3
  }
  if (code === 'slavesChampionOfRaids' && unit.player === player) return chargeRerollGain(state, player, unitId) * 8
  if (code === 'slavesRageOfArkhar' && unit.player === player) {
    // +1 Attack and +1 Rend on every melee weapon: worth the most on the unit that is about to swing the hardest
    let best = 0
    for (const e of engagedEnemyUnits(state, player, unitId)) best = Math.max(best, unitMeleeDamage(state, unitId, e, {}) * unitValue(state, e) * 0.02)
    return best * 4 + (state.units[unitId].turn.foughtThisPhase ? -3 : 0)
  }
  if (code === 'slavesOathOfSupremacy' && unit.player === player) {
    // +1 to hit until our next turn: worth the most on the unit that will swing before then (in combat now, or a likely charge)
    // (the hero phase comes before the move, so a unit not yet in combat gets its Move before the charge)
    let best = 0
    const move = stats0(state, unitId)?.M ?? 0
    for (const e of boardUnitsOf(state, other(player))) {
      const gap = minGapBetweenUnits(state, unitId, e.id)
      if (gap > 6 * chargeDiceCount(state, unitId) + 0.5 + move) continue
      const p = gap <= ENGAGEMENT_H ? 1 : chargeProb(Math.ceil(Math.max(0, gap - 0.5 - move)), chargeDiceCount(state, unitId))
      best = Math.max(best, p * unitMeleeDamage(state, unitId, e.id, { charged: gap > ENGAGEMENT_H }) * unitValue(state, e.id) * 0.02)
    }
    return best * 1.5
  }
  if (code === 'citiesDecisiveCommander' && unit.player === player) {
    // a unit missing models (On Your Feet!) or holding an objective (Yield No Quarter!) gains the most
    return (unit.startingStrength - unit.models.length) * 0.4 + (contestsObjective(state, unitId) ? 0.8 : 0)
  }
  return 0
}

// a set-up or move an ability offers as option ids that carry their own geometry (redeploy.ts `at:<x>:<z>` formation centres,
// aos-moves.ts `mv:<dx>:<dz>` slides): judged like a move, by where the unit would end (the unit's current shape moved there).
// Without it the bot took the first option, which for Call for Reinforcements is a board corner. Scaled down so it ranks the
// spots without swamping the ability's own score.
function abilityPlacementScore(state: GameState, pending: PendingDecision, optionId: string): number | null {
  if (pending.kind !== 'chooseOption') return null
  const data = pending.context.data as { redeploy?: boolean; move?: boolean; place?: boolean } | undefined
  if (!data?.redeploy && !data?.move && !data?.place) return null
  const unitId = (pending.context as { unitId?: UnitId | null }).unitId
  const unit = unitId ? state.units[unitId] : undefined
  if (!unitId || !unit) return null
  const models = unitModels(state, unitId).length > 0 ? unitModels(state, unitId) : unit.models.map((id) => state.models[id]).filter((m) => !!m && m.woundsRemaining > 0)
  if (models.length === 0) return null
  const at = /^at:(-?[\d.]+):(-?[\d.]+)$/.exec(optionId)
  const mv = /^mv:(-?[\d.]+):(-?[\d.]+)$/.exec(optionId)
  if (!at && !mv) return null
  const c = placementsCenter(models.map((m) => ({ modelId: m.id, pos: m.pos })))
  const dx = at ? Number(at[1]) - c.x : Number(mv![1])
  const dz = at ? Number(at[2]) - c.z : Number(mv![2])
  const placements: ModelPlacement[] = models.map((m) => ({ modelId: m.id, pos: { x: m.pos.x + dx, y: m.pos.y, z: m.pos.z + dz }, facing: m.facing }))
  return 0.5 + scorePosition(state, pending.player, unitId, placements, false) * 0.05
}

function abilityModeBonus(state: GameState, pending: PendingDecision, optionId: string): number {
  const abilityId = (pending as { context?: { abilityId?: string | null } }).context?.abilityId
  // The Officer's Order: set aside the card least likely to be scored, so its command is the one that comes free
  if (abilityId && state.abilities[abilityId]?.code === 'citiesOfficersOrder') return 0.5 - tacticOdds(state, pending.player, optionId)
  const koCode = abilityId ? state.abilities[abilityId]?.code : undefined
  const koMode = koCode?.startsWith('kharadron') ? kharadronModeBonus(state, koCode, (pending as { context?: { unitId?: UnitId | null } }).context?.unitId ?? null, optionId) : null
  if (koMode !== null) return koMode
  const sbgMode = koCode?.startsWith('soulblight') ? soulblightModeBonus(state, koCode, (pending as { context?: { unitId?: UnitId | null } }).context?.unitId ?? null, optionId) : null
  if (sbgMode !== null) return sbgMode
  const sceMode = koCode?.startsWith('stormcast') ? stormcastModeBonus(state, koCode, (pending as { context?: { unitId?: UnitId | null } }).context?.unitId ?? null, optionId) : null
  if (sceMode !== null) return sceMode
  const nurMode = koCode?.startsWith('nurgle') ? nurgleModeBonus(state, koCode, (pending as { context?: { unitId?: UnitId | null } }).context?.unitId ?? null, optionId, selectedAbilityTarget(state, pending)) : null
  if (nurMode !== null) return nurMode
  const placed = abilityPlacementScore(state, pending, optionId)
  if (placed !== null) return placed
  const target = selectedAbilityTarget(state, pending)
  if (!target || !state.units[target]) return 0
  const key = optionId.toLowerCase().replace(/[^a-z]/g, '')
  const unit = state.units[target]
  if (key.includes('feet')) return Math.min(3, unit.startingStrength - unit.models.length) * 0.5
  if (key.includes('yield')) return contestsObjective(state, target) ? 1.2 : 0.2
  return 0
}

function scoreAction(state: GameState, player: PlayerId, pending: PendingDecision, action: Action): number {
  switch (pending.kind) {
    case 'deployUnit': return action.type === 'deployUnit' ? scoreDeployUnit(state, player, action) : 0
    case 'chooseUnitToActivate': return scoreChooseUnitToActivate(state, player, pending, action)
    case 'declareMove': return action.type === 'declareMove' ? scoreDeclareMove(state, player, action) + (kharadronMoveBonus(state, player, action.unitId, action.moveType) ?? 0) : 0
    case 'moveUnit': return action.type === 'moveUnit' ? scorePosition(state, player, action.unitId, action.placements, false) : 0
    case 'declareTargets': return action.type === 'declareTargets' ? scoreDeclareTargets(state, pending, action) : 0
    case 'declareCharge': return action.type === 'declareCharge' || action.type === 'pass' ? scoreDeclareCharge(state, player, pending, action as DeclareChargeAction | { type: 'pass' }) : 0
    // passing a charge move after a good roll throws the charge away (and the Core slot with it): only when no move is offered
    case 'chargeMove': return action.type === 'chargeMove' ? 100 + scorePosition(state, player, action.unitId, action.placements, true) + (soulblightChargeBonus(state, player, action.unitId, action.placements) ?? 0) : 0
    case 'pileIn': return action.type === 'pileIn' ? scorePosition(state, player, action.unitId, action.placements, true) : 0
    case 'consolidate': return action.type === 'consolidate' ? scorePosition(state, player, action.unitId, action.placements, true) : 0
    case 'chooseFightUnit': return scoreChooseFightUnit(state, player, action)
    case 'stratagemWindow':
    case 'reactionWindow':
    case 'commandReroll': return action.type === 'pass' ? 1 : -1
    case 'chooseOption':
      // Spearhead cards: every option carries hint.value (what it is worth now, in VP-ish units); passing is worth a hair
      // above 0, so a discard, a command or an optional pick has to be worth something to beat keeping things as they are
      if (CARD_TOPICS.has(pending.context.topic)) {
        if (action.type === 'pass') return 0.01
        const opt = pending.options.find((o) => action.type === 'chooseOption' && o.id === action.optionId)
        const v = (opt?.hint as { value?: unknown } | undefined)?.value
        return typeof v === 'number' ? v : 0
      }
      // backing out of a target / mode pick just re-opens the same ability prompt, so it never beats picking something
      if (action.type === 'pass') return pending.context.topic === 'abilityTarget' || pending.context.topic === 'abilityMode' || pending.context.topic === 'pileInTarget' ? -5 : -1
      return scoreChooseOption(state, player, pending, action)
    default: return 0
  }
}

export class UtilityDecider implements Decider {
  private rng: Rng
  private loopKey = ''
  private loopCount = 0

  constructor(private difficulty: Difficulty = 'normal', seed: string | Rng = 'ai-utility') {
    this.rng = typeof seed === 'string' ? createRng(seed) : seed
  }

  static fromSerialized(difficulty: Difficulty, serialized: string): UtilityDecider {
    return new UtilityDecider(difficulty, restoreRng(serialized))
  }

  async decide(view: PlayerView, pending: PendingDecision, legal: Action[] | null): Promise<Action> {
    let options = legal ?? legalActions(view.state, pending) ?? []
    // re-formed moves and charge moves when the engine's own candidates leave the unit stuck (src/ai/moves.ts)
    if (pending.kind === 'moveUnit' || pending.kind === 'chargeMove') options = [...options, ...extraMoveCandidates(view.state, pending, options)]
    if (pending.kind === 'deployUnit') {
      const formed = chooseFormationDeployment(view.state, view.player, pending, this.rng)
      if (formed) return formed
    }
    if (options.length === 0) throw new Error(`UtilityDecider: no legal action for decision ${pending.id} (${pending.kind})`)
    if (options.length === 1) return options[0]
    const state = view.state
    // loop guard: the same prompt asked over and over in one phase means an ability the bot keeps re-opening; pass out of it
    const key = `${pending.kind}|${(pending as { context?: { topic?: string } }).context?.topic ?? ''}|${pending.window}|${state.round}|${state.activePlayer}|${state.phase}`
    if (key !== this.loopKey) { this.loopKey = key; this.loopCount = 0 }
    this.loopCount++
    if (this.loopCount > 12) {
      const pass = options.find((a) => a.type === 'pass')
      if (pass) return pass
    }
    const scored = options.map((a) => ({ a, s: scoreAction(state, view.player, pending, a) }))
    scored.sort((x, y) => y.s - x.s)
    if (this.difficulty === 'easy') {
      const top = scored.slice(0, Math.min(3, scored.length))
      const idx = Math.floor(this.rng.next() * top.length) % top.length
      return top[idx].a
    }
    return scored[0].a
  }

  serialize(): string { return this.rng.serialize() }
}

export function createUtilityDecider(difficulty: Difficulty, seed: string): Decider {
  return new UtilityDecider(difficulty, seed)
}
