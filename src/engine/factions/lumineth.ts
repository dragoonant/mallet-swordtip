// Lumineth Realm-lords (Hurakan Vanguard) code hooks: docs/spec/factions/lumineth-realm-lords.md (LRL-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/lumineth/abilities.json uses. Activated abilities
// use `activate` (hooks.ts ActivatedAbilityHook, run by abilities.ts); passive rules that no data scope can name are code. What each
// hook needs from data:
//
//  The leeward edge (spec §2) lives in mission.custom.lrlLeeward[player] ('z-' | 'x+' | 'z+' | 'x-'); the Ride the Hurricane uses of
//  the current round in mission.custom.lrlRth[player] ({ round, count }). Helpers: leewardOf, setLeeward, edgeDistanceOfUnit,
//  edgeDistanceOfPiece, closerToEdge, afterRideTheHurricane (count + turn the edge one step clockwise after the use resolved).
//
//  luminethStormBrewing (BT-1)         army ability, startOfRound / your, oncePerBattle (the engine runs no deployment-timed window, so
//        the pick is made at the start of round 1). The mode is the edge, the long edge behind the opponent first (the AI takes the
//        first mode). ensureEffects sets that default once the battle is under way if nobody picked.
//  luminethPulledByTheWinds (BT-2)     movement / any, oncePerTurnArmy; the hook rolls the D6 (the maximum distance). Queues a slide (aos-moves
//        writeMoveQueue) with towardEdge = the leeward edge and mayNotEndInCombat; a target needs a legal slide toward the edge.
//  luminethGaleForce (BT-3)            reaction youDeclared / ATTACK, oncePerTurnArmy. Grants the declaring unit +1 to hit until the
//        end of the phase; `gateEffect` limits it to this declaration (readDeclaredAttack seq) and to targets closer to the leeward
//        edge as it was snapshotted into the phase mark `lrl:gale:<effectId>`.
//  luminethLiftedDebris (RA-1)         command / your; targets = enemies closer to the leeward edge than the large feature in your
//        territory; rolls (round number) dice, each params.succeedOn+ is 1 mortal damage.
//  luminethRoaringHeadwind (RA-2)      command / enemy, oncePerBattle; marks the target with an empty effect until the end of the turn;
//        `moveEdgeConstraint` answers with the caster's CURRENT leeward edge.
//  luminethScatteredToTheWinds (ENH-1) passive marker; ensureEffects keeps a battle-long effect on the bearer's unit so `produce` can
//        answer at onObjectiveControl: -1 control per Ride the Hurricane use this round on enemy units within params.range.
//  luminethWindWhisperer (ENH-2)       command / any, oncePerBattle; mode = the other three edges. Not Ride the Hurricane.
//  luminethTempleGuardians (ENH-3)     passive; `adjustFeelNoPain` gives params.ward to the bearer and friendly Infantry within
//        params.range while another friendly Infantry unit is within that range.
//  luminethCurvedShots (ENH-4)         passive; `extraShootingOrigins` = points every params.spacing" along the leeward edge, for the
//        bearer's models only.
//  luminethGuideTheGusts (AB-1)        command / your, a Spell (castingValue in data, abilities.ts rolls it); target = a visible friendly
//        unit in combat wholly within params.range; grants shootAfterFallBack, chargeAfterFallBack and noRetreatDamage for the turn.
//  luminethEyeOfTheStorm (AB-2)        passive marker; ensureEffects keeps a battle-long effect on the Spirit, `produce` at onHitRoll
//        gives -1 to attacks on friendly units wholly within params.range of it (itself included).
//  luminethHurricaneWinds (AB-3)       shooting / any, roll D6 in data; target = an enemy this unit damaged by shooting this phase.
//  luminethLeapIntoTheStorm (AB-4)     endOfTurn / your; redeploys (redeploy.ts, region = strip along the leeward edge) and counts as a
//        Ride the Hurricane use. Offered only when a spot exists and the unit is not holding an objective it controls (AI hint).
//  luminethWallOfBlades (AB-5)         fight / any; hook rolls the D6 itself (+1 against a charging Cavalry unit), 3+ gives Strike-first.
//  AI hints: the abilities loop offers every usable ability and the bot uses what it is offered, so `canUse` / `targets` carry the
//  judgement (Wind Whisperer only once the edge has turned away from the default, Leap only when it gains something, Gale Force only
//  with a qualifying target, Guide the Gusts only on a unit in combat); target ordering is "best first".
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import { baseEdgePoints, EPS, playerBattlefieldEdge, type Footprint } from '../geometry'
import type { EngineContext } from '../modules'
import { rollSum } from '../dice'
import { damagedByShootingThisPhase } from '../attack'
import { largeFeatureIn } from '../cards'
import { readDeclaredAttack } from '../declared'
import { effectService } from '../effects'
import { losService } from '../los'
import { redeployOptions, requestRedeploy } from '../redeploy'
import { territoryOf, unitModels } from '../state'
import type { EdgeRef, GameState, PlayerId, Polygon, TerrainPiece, UnitId, Vec2 } from '../types'
import { checkSlide, edgeName, writeMoveQueue, type SlideOpts } from './aos-moves'
import {
  announce, enemiesInCombat, hasKeyword, inflictMortal, liveModels, liveObjectives, onBoard, paramOf, unitContestsObjective, unitsWithin, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

type Hook = Omit<ActivatedAbilityHook, 'targets'> & {
  targets?(state: GameState, unitId: UnitId | null, player?: PlayerId): UnitId[]
  modesFor?(state: GameState, unitId: UnitId | null, player: PlayerId): { id: string; label: string }[]
}

const playerOf = (state: GameState, use: { player?: PlayerId }): PlayerId => use.player ?? state.activePlayer
const myUnits = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()
const enemyUnits = (state: GameState, player: PlayerId): UnitId[] => myUnits(state, other(player))
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const byWeakest = (state: GameState) => (a: UnitId, b: UnitId): number => woundsLeft(state, a) - woundsLeft(state, b) || (a < b ? -1 : 1)

// ================= the leeward edge (spec §2) =================
export type EdgeId = 'z-' | 'x+' | 'z+' | 'x-'
/** clockwise as seen from above in the default camera (x to the right, +z down the screen) */
export const EDGES: readonly EdgeId[] = ['z-', 'x+', 'z+', 'x-']
export const isEdgeId = (v: unknown): v is EdgeId => typeof v === 'string' && (EDGES as readonly string[]).includes(v)
export const nextClockwise = (e: EdgeId): EdgeId => EDGES[(EDGES.indexOf(e) + 1) % EDGES.length]
export const edgeRef = (e: EdgeId): EdgeRef => ({ axis: e[0] === 'x' ? 'x' : 'z', sign: e[1] === '-' ? -1 : 1 })

const SIDE_NAME: Record<EdgeId, string> = { 'z-': 'top', 'x+': 'right', 'z+': 'bottom', 'x-': 'left' }
const isLongEdge = (state: GameState, e: EdgeId): boolean => (e[0] === 'z') === (state.board.w >= state.board.h)
export const edgeTitle = (state: GameState, e: EdgeId): string => `${SIDE_NAME[e]} ${isLongEdge(state, e) ? 'long' : 'short'} edge`

const leewardMap = (state: GameState): Partial<Record<PlayerId, EdgeId>> => (state.mission.custom.lrlLeeward as Partial<Record<PlayerId, EdgeId>> | undefined) ?? {}
const rthMap = (state: GameState): Partial<Record<PlayerId, { round: number; count: number }>> =>
  (state.mission.custom.lrlRth as Partial<Record<PlayerId, { round: number; count: number }>> | undefined) ?? {}

/** the edge the player picked (or that was defaulted), null while unset */
export const storedLeeward = (state: GameState, player: PlayerId): EdgeId | null => leewardMap(state)[player] ?? null

/** LRL-BT-1: no pick = the long edge behind the opponent's territory */
export function defaultLeeward(state: GameState, player: PlayerId): EdgeId {
  const side = playerBattlefieldEdge(state.board, territoryOf(state, other(player)))
  return side === 'T' ? 'z-' : side === 'B' ? 'z+' : side === 'L' ? 'x-' : 'x+'
}

export const leewardOf = (state: GameState, player: PlayerId): EdgeId => storedLeeward(state, player) ?? defaultLeeward(state, player)

export function setLeeward(state: GameState, player: PlayerId, edge: EdgeId): void {
  state.mission.custom = { ...state.mission.custom, lrlLeeward: { ...leewardMap(state), [player]: edge } }
}

/** Ride the Hurricane uses by `player` in the current battle round */
export function rthCount(state: GameState, player: PlayerId): number {
  const r = rthMap(state)[player]
  return r && r.round === state.round ? r.count : 0
}

// distance of one point to the edge line
function pointEdgeDistance(state: GameState, p: Vec2, e: EdgeId): number {
  const hw = state.board.w / 2, hh = state.board.h / 2
  switch (e) {
    case 'z-': return p.z + hh
    case 'z+': return hh - p.z
    case 'x-': return p.x + hw
    case 'x+': return hw - p.x
  }
}

/** closest point of the base outline to the edge line */
export function edgeDistanceOfModel(state: GameState, m: Footprint, e: EdgeId): number {
  return Math.min(...baseEdgePoints(m).map((p) => pointEdgeDistance(state, p, e)))
}

/** shortest distance from any model of the unit to the edge line (Infinity when it has no model on the board) */
export function edgeDistanceOfUnit(state: GameState, unitId: UnitId, e: EdgeId): number {
  return Math.min(Infinity, ...liveModels(state, unitId).map((m) => edgeDistanceOfModel(state, m, e)))
}

/** shortest distance from the feature's footprint to the edge line */
export function edgeDistanceOfPiece(state: GameState, piece: TerrainPiece, e: EdgeId): number {
  return Math.min(...piece.footprint.map((p) => pointEdgeDistance(state, p, e)))
}

/** is unit `a` strictly closer to the edge than unit `b` */
export const closerToEdge = (state: GameState, a: UnitId, b: UnitId, e: EdgeId): boolean => edgeDistanceOfUnit(state, a, e) < edgeDistanceOfUnit(state, b, e) - EPS

/** the end of every Ride the Hurricane ability: count the use and turn the owner's leeward edge one step clockwise */
export function afterRideTheHurricane(ctx: EngineContext, use: { abilityId: string; unitId: UnitId | null; player: PlayerId }): void {
  const s = ctx.state
  const count = rthCount(s, use.player) + 1
  s.mission.custom = { ...s.mission.custom, lrlRth: { ...rthMap(s), [use.player]: { round: s.round, count } } }
  const from = leewardOf(s, use.player)
  const to = nextClockwise(from)
  setLeeward(s, use.player, to)
  ctx.emit({ type: 'AbilityTriggered', abilityId: use.abilityId, sourceUnitId: use.unitId, targetUnitId: null, summary: `Leeward edge: the ${edgeTitle(s, from)} turns clockwise to the ${edgeTitle(s, to)}`, player: use.player })
}

// the edges in the order a pick offers them: the default first (the AI takes the first mode), then clockwise from it
function orderedEdges(state: GameState, player: PlayerId, skip?: EdgeId | null): EdgeId[] {
  const def = defaultLeeward(state, player)
  const start = EDGES.indexOf(def)
  return [0, 1, 2, 3].map((i) => EDGES[(start + i) % 4]).filter((e) => e !== skip)
}

const edgeModes = (state: GameState, player: PlayerId, skip?: EdgeId | null): { id: string; label: string }[] => {
  const def = defaultLeeward(state, player)
  return orderedEdges(state, player, skip).map((e) => ({ id: e, label: `The ${edgeTitle(state, e)}${e === def ? ' (behind the enemy)' : ''}` }))
}

const hasTrait = (state: GameState, player: PlayerId, code: string): boolean =>
  (state.players[player]?.battleTraitIds ?? []).some((id) => state.abilities[id]?.code === code)

// ---------- LRL-BT-1 Storm Brewing ----------
const CODE_STORM = 'luminethStormBrewing'

const stormActivate: Hook = {
  canUse: (state, _unitId, use) => storedLeeward(state, playerOf(state, use)) === null,
  modesFor: (state, _unitId, player) => edgeModes(state, player),
  resolve(ctx, use) {
    const edge = use.modeId
    if (!isEdgeId(edge)) return
    setLeeward(ctx.state, use.player, edge)
    announce(ctx, use, null, `Storm Brewing: the ${edgeTitle(ctx.state, edge)} is your leeward edge`)
  },
}
const luminethStormBrewing: EngineCodeHook = {
  name: CODE_STORM, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: stormActivate,
  // idempotent: once the battle is under way (the round-1 start-of-round pick is over) an unset edge becomes the default
  ensureEffects(ctx) {
    const s = ctx.state
    if (s.phase === 'setup' || s.phase === 'deployment' || s.phase === 'ended') return
    for (const p of ['A', 'B'] as PlayerId[]) {
      if (!hasTrait(s, p, CODE_STORM) || storedLeeward(s, p) !== null) continue
      const edge = defaultLeeward(s, p)
      setLeeward(s, p, edge)
      ctx.emit({ type: 'AbilityTriggered', abilityId: s.players[p].battleTraitIds.find((id) => s.abilities[id]?.code === CODE_STORM) ?? CODE_STORM, sourceUnitId: null, targetUnitId: null, summary: `Storm Brewing: no edge was picked, the ${edgeTitle(s, edge)} is the leeward edge`, player: p })
    }
  },
}

// ---------- LRL-BT-2 Pulled by the Winds ----------
const slideOptsFor = (state: GameState, player: PlayerId): SlideOpts => ({ towardEdge: edgeRef(leewardOf(state, player)), mayNotEndInCombat: true, passThrough: true })

// a cheap legality probe: some short slide with a positive component toward the edge exists
function canSlideTowardLeeward(state: GameState, unitId: UnitId, player: PlayerId): boolean {
  const e = edgeRef(leewardOf(state, player))
  const base = Math.atan2(e.axis === 'z' ? e.sign : 0, e.axis === 'x' ? e.sign : 0)
  const opts = slideOptsFor(state, player)
  for (const off of [0, 0.5, -0.5, 1, -1, 1.35, -1.35]) {
    const a = base + off
    if (checkSlide(state, unitId, Math.cos(a) * 1, Math.sin(a) * 1, 1, false, opts).ok) return true
  }
  return false
}

const pulledTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] => {
  const p = player ?? state.activePlayer
  return myUnits(state, p).filter((id) => !losService.unitInCombat(state, id) && canSlideTowardLeeward(state, id, p))
}

const pulledActivate: Hook = {
  canUse: () => true, // the target list (a unit with a legal slide) is the real gate; abilities.ts drops the ability when it is empty
  targets: pulledTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    // the declared D6 is the maximum distance (the descriptor has no `roll`: a 1+ roll is not a valid declared roll)
    const dist = rollSum(use.roll ?? ctx.roll({ purpose: 'ability', player: use.player, targetUnitId: target, commandRerollable: false }))
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: dist, queue: [target], opts: slideOptsFor(s, use.player) })
    announce(ctx, use, target, `Pulled by the Winds: ${s.units[target].name} may move up to ${dist}" toward the ${edgeTitle(s, leewardOf(s, use.player))}`)
    afterRideTheHurricane(ctx, use)
  },
}
const luminethPulledByTheWinds: EngineCodeHook = { name: 'luminethPulledByTheWinds', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: pulledActivate }

// ---------- LRL-BT-3 Gale Force ----------
const CODE_GALE = 'luminethGaleForce'
const GALE = 'lrl:gale:'
interface GaleMark { edge: EdgeId; unitId: UnitId; seq: number }

const galeMark = (state: GameState, effectId: string): GaleMark | null => {
  const m = state.phaseState.marks.find((x) => x.startsWith(`${GALE}${effectId}=`))
  return m ? (JSON.parse(m.slice(m.indexOf('=') + 1)) as GaleMark) : null
}

// is there a target of the declared attack that stands closer to `edge` than the attacker?
function galeQualifies(state: GameState, attackerId: UnitId, phase: 'shooting' | 'fight', edge: EdgeId): boolean {
  const atk = state.phaseState.attack
  const targets = phase === 'shooting' && atk && atk.attackerUnitId === attackerId && atk.targetUnitIds.length > 0 ? atk.targetUnitIds : enemiesInCombat(state, attackerId)
  return targets.some((t) => onBoard(state, t) && closerToEdge(state, t, attackerId, edge))
}

const galeActivate: Hook = {
  canUse(state, _u, use) {
    const d = readDeclaredAttack(state)
    const player = playerOf(state, use)
    const unit = d ? onBoard(state, d.unitId) : null
    return !!d && !!unit && unit.player === player && galeQualifies(state, d.unitId, d.phase, leewardOf(state, player))
  },
  resolve(ctx, use) {
    const s = ctx.state
    const d = readDeclaredAttack(s)
    if (!d || !onBoard(s, d.unitId)) return
    const edge = leewardOf(s, use.player) // snapshot: the comparison keeps using this edge although the edge turns right after
    const bonus = num(paramOf(s, use.abilityId, 'hitBonus', 1), 1)
    const eff = effectService.grant(ctx, d.unitId, { modifyRoll: { roll: 'hit', value: bonus } }, { sourceAbilityId: use.abilityId, sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    s.phaseState.marks.push(`${GALE}${eff.id}=${JSON.stringify({ edge, unitId: d.unitId, seq: d.seq } satisfies GaleMark)}`)
    announce(ctx, use, d.unitId, `Gale Force: ${s.units[d.unitId].name} adds ${bonus} to hit against targets closer to the ${edgeTitle(s, edge)}`)
    afterRideTheHurricane(ctx, use)
  },
}
const luminethGaleForce: EngineCodeHook = {
  name: CODE_GALE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: galeActivate,
  // the granted +1 applies to this activation's attacks on a target closer to the snapshotted edge than the attacker
  gateEffect(state, _holder, entry, data) {
    if (!entry.active) return true
    const mark = galeMark(state, entry.active.id)
    if (!mark) return false
    const atk = data?.attack as { attackerUnitId: UnitId; targetUnitId: UnitId } | undefined
    if (!atk) return true
    if (atk.attackerUnitId !== mark.unitId || readDeclaredAttack(state)?.seq !== mark.seq) return false
    return closerToEdge(state, atk.targetUnitId, atk.attackerUnitId, mark.edge)
  },
}

// ---------- LRL-RA-1 Lifted Debris ----------
function debrisTargets(state: GameState, player: PlayerId): UnitId[] {
  const feature = largeFeatureIn(state, player)
  if (!feature) return []
  const edge = leewardOf(state, player)
  const limit = edgeDistanceOfPiece(state, feature, edge)
  return enemyUnits(state, player).filter((id) => edgeDistanceOfUnit(state, id, edge) < limit - EPS).sort(byWeakest(state))
}

const debrisActivate: Hook = {
  canUse: (state, _u, use) => debrisTargets(state, playerOf(state, use)).length > 0,
  targets: (state, _u, player) => debrisTargets(state, player ?? state.activePlayer),
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const dice = Math.max(1, s.round)
    const need = num(paramOf(s, use.abilityId, 'succeedOn', 3), 3)
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: dice, mode: 'perDie', targetUnitId: target, commandRerollable: false })
    const hits = roll.final.filter((d) => d >= need).length
    announce(ctx, use, target, `Lifted Debris: ${dice} dice, ${hits} at ${need}+ (${hits} mortal damage)`)
    inflictMortal(ctx, use, target, hits)
    afterRideTheHurricane(ctx, use)
  },
}
const luminethLiftedDebris: EngineCodeHook = { name: 'luminethLiftedDebris', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: debrisActivate }

// ---------- LRL-RA-2 Roaring Headwind ----------
const CODE_HEADWIND = 'luminethRoaringHeadwind'

const headwindActivate: Hook = {
  canUse: (state, _u, use) => enemyUnits(state, playerOf(state, use)).length > 0,
  targets: (state, _u, player) => enemyUnits(state, player ?? state.activePlayer),
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    effectService.grant(ctx, target, {}, { sourceAbilityId: use.abilityId, sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Roaring Headwind: ${ctx.state.units[target].name} must end every move closer to the ${edgeTitle(ctx.state, leewardOf(ctx.state, use.player))} this turn`)
  },
}
const luminethRoaringHeadwind: EngineCodeHook = {
  name: CODE_HEADWIND, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: headwindActivate,
  // read live: the caster's leeward edge may have turned since the marker was laid
  moveEdgeConstraint(state, entry, unitId) {
    if (!entry.active || entry.holderUnitId !== unitId) return null
    const holder = state.units[unitId]
    return holder ? edgeRef(leewardOf(state, other(holder.player))) : null
  },
}

// ---------- battle-long effects the passive producers answer on ----------
// puts one battle-long effect on every unit that carries an ability with this code (datasheet or enhancement) and has none yet
function ensureBattleEffect(ctx: EngineContext, code: string): void {
  const s = ctx.state
  for (const ab of Object.values(s.abilities)) {
    if (ab.code !== code) continue
    const holders: UnitId[] = ab.source === 'enhancement' && ab.bearerModelId
      ? [s.models[ab.bearerModelId]?.unitId].filter((x): x is UnitId => !!x)
      : Object.values(s.units).filter((u) => (s.datasheets[u.datasheetId]?.abilities ?? []).includes(ab.id)).map((u) => u.id)
    for (const id of holders) {
      const unit = s.units[id]
      if (!unit || unit.location === 'destroyed' || unit.effects.some((e) => e.sourceAbilityId === ab.id)) continue
      effectService.grant(ctx, unit.id, {}, { sourceAbilityId: ab.id, sourceUnitId: unit.id, scope: { who: 'self' }, duration: 'battle' })
    }
  }
}

// ---------- LRL-ENH-1 Scattered to the Winds ----------
const CODE_SCATTERED = 'luminethScatteredToTheWinds'
const luminethScatteredToTheWinds: EngineCodeHook = {
  name: CODE_SCATTERED, kind: 'ability', hook: 'onStatQuery', run: noop,
  producesAt: ['onObjectiveControl'],
  produce(ctx, entry, data) {
    if (!entry.active) return null
    const s = ctx.state
    const holder = onBoard(s, entry.holderUnitId)
    const contesting = typeof data.contestingUnitId === 'string' ? onBoard(s, data.contestingUnitId) : null
    if (!holder || !contesting || contesting.player === holder.player) return null
    const count = rthCount(s, holder.player)
    if (count <= 0 || !unitsWithin(s, holder.id, contesting.id, num(entry.params.range, 6))) return null
    return { kind: 'stat', delta: -count }
  },
  ensureEffects: (ctx) => ensureBattleEffect(ctx, CODE_SCATTERED),
}

// ---------- LRL-ENH-2 Wind Whisperer ----------
const whispererActivate: Hook = {
  // AI hint: only once the wind has turned away from the long edge behind the enemy
  canUse: (state, unitId, use) => !!onBoard(state, unitId) && leewardOf(state, playerOf(state, use)) !== defaultLeeward(state, playerOf(state, use)),
  modesFor: (state, _unitId, player) => edgeModes(state, player, leewardOf(state, player)),
  resolve(ctx, use) {
    const edge = use.modeId
    if (!isEdgeId(edge)) return
    setLeeward(ctx.state, use.player, edge)
    announce(ctx, use, null, `Wind Whisperer: the ${edgeTitle(ctx.state, edge)} is your leeward edge`)
  },
}
const luminethWindWhisperer: EngineCodeHook = { name: 'luminethWindWhisperer', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: whispererActivate }

// ---------- LRL-ENH-3 Temple Guardians ----------
const luminethTempleGuardians: EngineCodeHook = {
  name: 'luminethTempleGuardians', kind: 'ability', hook: 'onStatQuery', run: noop,
  adjustFeelNoPain(state, entry, modelId, current) {
    const model = state.models[modelId]
    const general = onBoard(state, entry.holderUnitId)
    if (!model || !general) return null
    const range = num(entry.params.range, 3)
    const infantry = myUnits(state, general.player).filter((id) => id !== general.id && hasKeyword(state, id, 'INFANTRY') && unitsWithin(state, general.id, id, range))
    if (infantry.length === 0) return null
    if (model.unitId !== general.id && !infantry.includes(model.unitId)) return null
    return { threshold: Math.min(current ?? 7, num(entry.params.ward, 5)), modifier: 0 }
  },
}

// ---------- LRL-ENH-4 Curved Shots ----------
const luminethCurvedShots: EngineCodeHook = {
  name: 'luminethCurvedShots', kind: 'ability', hook: 'onStatQuery', run: noop,
  extraShootingOrigins(state, entry, modelId) {
    const model = state.models[modelId]
    const holder = onBoard(state, entry.holderUnitId)
    if (!model || !holder || model.unitId !== holder.id) return null
    const e = leewardOf(state, holder.player)
    const hw = state.board.w / 2, hh = state.board.h / 2
    const step = Math.max(0.25, num(entry.params.spacing, 1))
    const pts: Vec2[] = []
    if (e[0] === 'z') {
      const z = e[1] === '-' ? -hh : hh
      for (let x = -hw; x <= hw + EPS; x += step) pts.push({ x, z })
    } else {
      const x = e[1] === '-' ? -hw : hw
      for (let z = -hh; z <= hh + EPS; z += step) pts.push({ x, z })
    }
    return pts
  },
}

// ---------- LRL-AB-1 Guide the Gusts ----------
const gustRange = (state: GameState, datasheetId: string): number => {
  const id = (state.datasheets[datasheetId]?.abilities ?? []).find((a) => state.abilities[a]?.code === 'luminethGuideTheGusts')
  return num(id ? state.abilities[id]?.params?.range : undefined, 12)
}

function gustsTargets(state: GameState, caster: UnitId | null): UnitId[] {
  const mage = onBoard(state, caster)
  if (!mage) return []
  const range = gustRange(state, mage.datasheetId)
  const mine = liveModels(state, mage.id)
  return myUnits(state, mage.player).filter((id) => {
    // a unit that is not in combat has nothing to retreat from, so the spell would do nothing: only units in combat are offered
    if (!losService.unitInCombat(state, id)) return false
    if (!whollyWithinUnit(state, id, mage.id, range)) return false
    return id === mage.id || mine.some((m) => losService.unitVisible(state, m.id, id))
  })
}

const gustsActivate: Hook = {
  canUse: (state, unitId) => gustsTargets(state, unitId).length > 0,
  targets: (state, unitId) => gustsTargets(state, unitId),
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    effectService.grant(ctx, target, [{ shootAfterFallBack: true }, { chargeAfterFallBack: true }, { noRetreatDamage: true }],
      { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Guide the Gusts: ${ctx.state.units[target].name} can Retreat and still Shoot and Charge, taking no damage from the Retreat, this turn`)
  },
}
const luminethGuideTheGusts: EngineCodeHook = { name: 'luminethGuideTheGusts', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: gustsActivate }

// ---------- LRL-AB-2 Eye of the Storm ----------
const CODE_EYE = 'luminethEyeOfTheStorm'
const luminethEyeOfTheStorm: EngineCodeHook = {
  name: CODE_EYE, kind: 'ability', hook: 'onStatQuery', run: noop,
  producesAt: ['onHitRoll'],
  produce(ctx, entry, data) {
    if (!entry.active) return null
    const s = ctx.state
    const attack = data.attack as { targetUnitId: UnitId } | undefined
    const spirit = onBoard(s, entry.holderUnitId)
    if (!attack || !spirit) return null
    const target = onBoard(s, attack.targetUnitId)
    if (!target || target.player !== spirit.player) return null
    if (!whollyWithinUnit(s, target.id, spirit.id, num(entry.params.range, 6))) return null
    return { kind: 'roll', modifier: num(entry.params.modifier, -1) }
  },
  ensureEffects: (ctx) => ensureBattleEffect(ctx, CODE_EYE),
}

// ---------- LRL-AB-3 Hurricane Winds ----------
const windsTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const me = onBoard(state, unitId)
  return me ? damagedByShootingThisPhase(state, me.id).filter((id) => onBoard(state, id)?.player !== me.player && !!onBoard(state, id)) : []
}

const windsActivate: Hook = {
  canUse: (state, unitId) => windsTargets(state, unitId).length > 0,
  targets: (state, unitId) => windsTargets(state, unitId),
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    const unit = target ? onBoard(ctx.state, target) : null
    if (!unit) return
    unit.turn.fightsLast = true
    announce(ctx, use, target, `Hurricane Winds: ${unit.name} fights last for the rest of the turn`)
  },
}
const luminethHurricaneWinds: EngineCodeHook = { name: 'luminethHurricaneWinds', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: windsActivate }

// ---------- LRL-AB-4 Leap into the Storm ----------
// the strip along the edge, `depth` deep (the board's own rectangle clipped to it)
function edgeStrip(state: GameState, e: EdgeId, depth: number): Polygon {
  const hw = state.board.w / 2, hh = state.board.h / 2
  switch (e) {
    case 'z-': return [{ x: -hw, z: -hh }, { x: hw, z: -hh }, { x: hw, z: -hh + depth }, { x: -hw, z: -hh + depth }]
    case 'z+': return [{ x: -hw, z: hh - depth }, { x: hw, z: hh - depth }, { x: hw, z: hh }, { x: -hw, z: hh }]
    case 'x-': return [{ x: -hw, z: -hh }, { x: -hw + depth, z: -hh }, { x: -hw + depth, z: hh }, { x: -hw, z: hh }]
    case 'x+': return [{ x: hw - depth, z: -hh }, { x: hw, z: -hh }, { x: hw, z: hh }, { x: hw - depth, z: hh }]
  }
}

const leapParams = (state: GameState, abilityId: string | undefined): { depth: number; minEnemyDistance: number } => ({
  depth: num(abilityId ? paramOf(state, abilityId, 'depth', 3) : 3, 3),
  minEnemyDistance: num(abilityId ? paramOf(state, abilityId, 'minEnemyDistance', 6) : 6, 6),
})

// a 3" strip along a short edge only holds a row of ovals that lies along the edge: the formation keeps the models' facing, so
// the unit is turned to run along the edge first (0 = along x for the long edges, a quarter turn for the short ones)
const facingFor = (e: EdgeId): number => (e[0] === 'x' ? Math.PI / 2 : 0)

function withFacing<T>(state: GameState, unitId: UnitId, facing: number, fn: () => T): T {
  const models = unitModels(state, unitId)
  const saved = models.map((m) => m.facing)
  for (const m of models) m.facing = facing
  try { return fn() } finally { models.forEach((m, i) => { m.facing = saved[i] }) }
}

const leapActivate: Hook = {
  canUse(state, unitId, use) {
    const unit = onBoard(state, unitId)
    if (!unit || losService.unitInCombat(state, unit.id)) return false
    // AI hint: a unit holding an objective its side controls stays put
    if (liveObjectives(state).some((o) => o.controller === unit.player && unitContestsObjective(state, unit.id, o))) return false
    const { depth, minEnemyDistance } = leapParams(state, use.abilityId)
    const edge = leewardOf(state, unit.player)
    const region = edgeStrip(state, edge, depth)
    return withFacing(state, unit.id, facingFor(edge), () => redeployOptions(state, unit.id, minEnemyDistance, 1, { region }).length > 0)
  },
  resolve(ctx, use) {
    const s = ctx.state
    const unit = onBoard(s, use.unitId)
    if (!unit || losService.unitInCombat(s, unit.id)) return
    const { depth, minEnemyDistance } = leapParams(s, use.abilityId)
    const edge = leewardOf(s, use.player)
    for (const m of unitModels(s, unit.id)) m.facing = facingFor(edge)
    requestRedeploy(s, { abilityId: use.abilityId, player: use.player, unitIds: [unit.id], minEnemyDistance, region: edgeStrip(s, edge, depth) })
    announce(ctx, use, null, `Leap into the Storm: ${unit.name} leaves the battlefield to be set up wholly within ${depth}" of the ${edgeTitle(s, edge)}`)
    afterRideTheHurricane(ctx, use)
  },
}
const luminethLeapIntoTheStorm: EngineCodeHook = { name: 'luminethLeapIntoTheStorm', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: leapActivate }

// ---------- LRL-AB-5 Wall of Blades ----------
const chargersInCombat = (state: GameState, unitId: UnitId): UnitId[] => enemiesInCombat(state, unitId).filter((id) => state.units[id].turn.chargedThisTurn)

const wallActivate: Hook = {
  canUse(state, unitId) {
    const unit = onBoard(state, unitId)
    return !!unit && !unit.turn.chargedThisTurn && !unit.turn.fightsFirst && chargersInCombat(state, unit.id).length > 0
  },
  resolve(ctx, use) {
    const s = ctx.state
    const unit = onBoard(s, use.unitId)
    if (!unit) return
    const chargers = chargersInCombat(s, unit.id)
    if (chargers.length === 0) return
    const cavalry = chargers.some((id) => hasKeyword(s, id, 'CAVALRY'))
    const bonus = cavalry ? num(paramOf(s, use.abilityId, 'cavalryBonus', 1), 1) : 0
    const need = num(paramOf(s, use.abilityId, 'succeedOn', 3), 3)
    const die = rollSum(ctx.roll({ purpose: 'ability', player: use.player, unitId: unit.id, commandRerollable: false }))
    const total = die + bonus
    if (total < need) { announce(ctx, use, chargers[0], `Wall of Blades: rolled ${die}${bonus ? ` +${bonus}` : ''}, the charge breaks through`); return }
    unit.turn.fightsFirst = true
    announce(ctx, use, chargers[0], `Wall of Blades: rolled ${die}${bonus ? ` +${bonus} against Cavalry` : ''}, ${unit.name} fights first this turn`)
  },
}
const luminethWallOfBlades: EngineCodeHook = { name: 'luminethWallOfBlades', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: wallActivate }

export const luminethHooks: Record<string, EngineCodeHook> = {
  luminethStormBrewing, luminethPulledByTheWinds, luminethGaleForce, luminethLiftedDebris, luminethRoaringHeadwind,
  luminethScatteredToTheWinds, luminethWindWhisperer, luminethTempleGuardians, luminethCurvedShots,
  luminethGuideTheGusts, luminethEyeOfTheStorm, luminethHurricaneWinds, luminethLeapIntoTheStorm, luminethWallOfBlades,
}
