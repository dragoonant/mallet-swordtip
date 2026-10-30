// Code hook registry (20-data §3 `code`). Spearhead port (13-engine-port-plan WP7): the registry holds the AoS armies' hooks only,
// `...citiesHooks, ...ironjawzHooks` (src/engine/factions/{cities,ironjawz}.ts). Guarded Hero lives in shooting.ts, not here.
// The 40k registry is gone; the 40k faction files stay on disk (they only import the types below) until WP8 deletes them.
//
// Reactions (Fire Overwatch, Heroic Intervention ...) are recorded in phaseState.marks (`reaction:<json>`); the owning module reads
// them with `pendingReactions(state)` and removes them with `consumeReaction`. Kept for stratagems.ts and the phase modules.
import type { CoreAbility, Scope, TimingWindowId } from '../data/types'
import type { Action } from './actions'
import { withinObjectiveRange, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE } from './geometry'
import type { CodeHook, HookName, HookResult } from './hooks'
import { hookService, type HookSourceEntry } from './hooks-impl'
import { leaderService } from './leaders'
import type { EngineContext, Services, WindowTrigger } from './modules'
import { keywordsOf, unitModels } from './state'
import { citiesHooks } from './factions/cities'
import { ironjawzHooks } from './factions/ironjawz'
import { slavesHooks } from './factions/slaves'
import { fyreslayersHooks } from './factions/fyreslayers'
import { luminethHooks } from './factions/lumineth'
import { kharadronHooks } from './factions/kharadron'
import { gloomspiteHooks } from './factions/gloomspite'
import { kruleboyzHooks } from './factions/kruleboyz'
import { spearheadCallForReinforcements } from './factions/spearhead-core'
import type {
  ChooseOptionDecision, ChooseOptionTopic, DiceRoll, GameState, Model, ModelId, Objective, PendingDecision, PlayerId, ReactionWindowDecision, Rejection,
  RuntimeAbility, RuntimeStratagem, RuntimeWeapon, Unit, UnitId, Vec2, WeaponId, EdgeRef, Phase,
} from './types'
import type { DestroyedBy } from './attack'

export type ReactionKind = ReactionWindowDecision['context']['reaction']

export interface StratagemEnv {
  state: GameState
  services: Services
  player: PlayerId
  stratagem: RuntimeStratagem
  window: TimingWindowId
  trigger: WindowTrigger
}

// one id per expanded TargetSpec (unit id or model id, spec order) plus the chosen objective marker
export interface StratagemTuple { ids: string[]; objectiveId: string | null }

export interface EngineCodeHook extends CodeHook {
  kind: 'ability' | 'stratagem' | 'mission'
  // declarative effects of the source only apply at these hooks (Veteran Instincts: wound rolls only)
  hooks?: HookName[]
  // E3: a descriptor with this code applies its `reroll` key at every hook listed here (Auramite Thunderbolt: charge + advance)
  rerollHooks?: HookName[]
  // false → the ability's own declarative effects are inactive right now (Waaagh! lives in ActiveEffects; Dead 'ard)
  // `data` is the hook-specific context (attack / roll ...) when evaluated for a roll hook; Resonant Focus reads the attack
  gate?(state: GameState, holder: Unit, entry: HookSourceEntry, data?: Record<string, unknown>): boolean
  // extra Battle-shock dice this source gives the testing unit (Tyranid Synapse); the highest value among sources is rolled
  battleShockDice?(state: GameState, testUnitId: UnitId, entry: HookSourceEntry): number
  // gate for the ActiveEffects a stratagem hook granted (ordinary `gate` is skipped for those): Bring It Down limits its
  // re-roll to the attackers snapshotted at use time
  gateActive?(state: GameState, entry: HookSourceEntry, data?: Record<string, unknown>): boolean
  // replaces the source's own scope (Resonant Focus: the enhancement data has no scope, which would default to `bearer`)
  forceScope?: Scope
  // like `gate`, but also consulted for effects an ActiveEffect carries (stratagem grants), where `gate` is skipped (Vindictive Strategy)
  gateEffect?(state: GameState, holder: Unit, entry: HookSourceEntry, data?: Record<string, unknown>): boolean
  // C4: true when this source lets its player re-roll the Attacks (A) roll of `weapon` fired by `attackerModelId`
  rerollsAttackCount?(state: GameState, entry: HookSourceEntry, attackerModelId: ModelId, weapon: RuntimeWeapon): boolean
  // C4 (THO Glimpse of Eternity): this source may set one die of `roll` to `value` once per `usedKey` (stored in the roller's
  // secondaryState); null = no opinion. Offered by fix-roll.ts
  fixRoll?(state: GameState, entry: HookSourceEntry, roll: DiceRoll): { value: number; usedKey: string } | null
  // C5: core abilities this source currently grants to `unitId` (Gunnery Officer: LONE_OPERATIVE)
  grantsCoreAbility?(state: GameState, entry: HookSourceEntry, unitId: UnitId): CoreAbility['ability'][]
  // E2 (SM Omni-scramblers): enemy units arriving from Reserves for `arrivingPlayer` may not be set up within `distance"
  // (horizontal edge-to-edge) of any model of `unitIds`; null = no zone
  reserveExclusion?(state: GameState, entry: HookSourceEntry, arrivingPlayer: PlayerId): { unitIds: UnitId[]; distance: number } | null
  // E3 (SM Shrouding): ranged attacks against `targetUnitId` from `firingModelId` are only legal within this many inches; null = no opinion
  targetRangeCap?(state: GameState, entry: HookSourceEntry, targetUnitId: UnitId, firingModelId: ModelId): number | null
  // C1 (T'au For the Greater Good): signed BS/WS step for one attack: -1 = one step better (4+ -> 3+), +1 = one step worse; null/0 = no opinion
  skillDeltaVsTarget?(state: GameState, entry: HookSourceEntry, attackerModelId: ModelId, weapon: RuntimeWeapon,
    targetUnitId: UnitId, info: { kind: 'ranged' | 'melee'; overwatch: boolean }): number | null
  // C2 (T'au Cover Fire): Overwatch hit threshold for the shooter under this stratagem (null = no opinion)
  overwatchHitOn?(state: GameState, entry: HookSourceEntry, shooterUnitId: UnitId, stratagemId: string): number | null
  // E4 (T'au Electro-static Flares): true when enemies may not use Fire Overwatch to shoot at `targetUnitId` (the moving / charging unit)
  forbidsOverwatchAgainst?(state: GameState, entry: HookSourceEntry, targetUnitId: UnitId): boolean
  // C4 (T'au DS8 Support Turret): false makes the weapon unavailable to the model (null = no opinion)
  weaponAvailable?(state: GameState, entry: HookSourceEntry, modelId: ModelId, weaponId: WeaponId): boolean | null
  // C1 (World Eaters Wrathful Devotion): runs after every other FNP source of `modelId` has been merged. `current` = the best FNP
  // threshold the model has without this source (null = none). Returns the threshold to use and a modifier added to the FNP die;
  // null = no opinion. AoS (attack.ts wardThreshold): asked of every source on the board whatever its scope, so a code hook can give
  // a Ward to a unit no data scope names (FYR-AB-3 Duty Unto Death: the general); the best ward wins (min with `current`)
  adjustFeelNoPain?(state: GameState, entry: HookSourceEntry, modelId: ModelId, current: number | null): { threshold: number | null; modifier: number } | null
  // answers a chooseOption whose context.data.code names this hook, when the hook has no `pick` of its own
  answer?(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void
  // side effects at the descriptor's trigger hook, after its `when` passed (Piston-driven Brutality)
  runAt?(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): void
  // window-keyed pick raised as a chooseOption decision (Oath of Moment, Waaagh!)
  pick?: {
    window: TimingWindowId
    // further windows the same pick is offered at (Dark Pacts: shooting.unitSelected + fight.unitSelected)
    windows?: TimingWindowId[]
    topic: ChooseOptionTopic
    offer(ctx: EngineContext, window: TimingWindowId, key: string): boolean
    handle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void
  }
  // answers collect() at `producesAt` for a source with no declarative form (A Martyr's Death returns a deferRemoval
  // request for the destroyed model). Called with the hook-specific data; null = nothing to report.
  producesAt?: HookName[]
  produce?(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): HookResult | null
  // ---- stratagems ----
  reaction?: ReactionKind
  // friendly unit candidates come from Reserves instead of the battlefield
  reserves?: boolean
  // friendly unit candidates come from destroyed units (Send in the Next Wave)
  destroyedTargets?: boolean
  // the hook grants the declarative effect itself (not to targets[0])
  grantsItself?: boolean
  // one option per objective marker (Duty and Honour)
  needsObjective?: boolean
  check?(env: StratagemEnv, tuple: StratagemTuple): boolean
  apply?(ctx: EngineContext, env: StratagemEnv, tuple: StratagemTuple): void
  // ---- Spearhead ----
  // IJZ-5.4.1 (You Messin'?): true when this source stops `unitId` from contesting objectives right now. Asked through
  // hookService.contestAllowed, which objectives.ts calls for every unit that would otherwise contest.
  denyContest?(state: GameState, entry: HookSourceEntry, unitId: UnitId): boolean
  // called by abilities.ts at the top of every ability window, for each code present in state.abilities: put the battle-long
  // effects or bookkeeping this source needs in place (Glimmering's re-roll holder, Consecrate the Land's Ward). Must be idempotent.
  ensureEffects?(ctx: EngineContext): void
  // STD-AB-4 (Glorious Death): called by attack.ts each time a model of a unit whose datasheet (or army battle trait / regiment
  // ability) names this code is slain, even when it was the unit's last model. `model` is the snapshot at removal; `by` says who
  // slew it and how (by.kind 'melee' = a combat attack). Hold mortal damage for after the Fight with attack.ts deferMortalAfterFight.
  onOwnModelSlain?(ctx: EngineContext, info: { ability: RuntimeAbility; unitId: UnitId; model: Model; by: DestroyedBy }): void
  // STD-ENH-4 (Fell Ritualist): extra battle tactic cards the source's player may draw after each draw step (0 = none). Asked of
  // every source whose holder belongs to `player` and is on the board; the largest answer counts. cards.ts then offers the draw
  // (topic 'extraTactic') and the put-back to the bottom of the deck (topic 'bottomTactic').
  extraTacticDraw?(state: GameState, entry: HookSourceEntry, player: PlayerId): number
  // ---- F8 engine items (four new armies). Each is asked of EVERY source entry on the board, passive descriptors and
  // ActiveEffects alike (entry.active is set for an effect an activated ability granted, which is how an activated ability
  // keeps answering after its use), after the source's gate. ----
  // KRU-ENH Egomaniak: damage points allocated to `unitId` may be moved to another unit. attack.ts resolvePool asks
  // hookService.damageRedirectFor after the ward rolls: one D6 per remaining point, each roll >= succeedOn moves that point to
  // one recipient (the candidate on the board with the most wounds left, ties by unit id), allocated with no second ward.
  redirectDamage?(state: GameState, entry: HookSourceEntry, unitId: UnitId): { candidates: UnitId[]; succeedOn: number } | null
  // GLO-ENH Sunsteala Shard: true when `firingUnitId` may not pick `targetUnitId` as a shooting target right now
  // (phases/shooting.ts targetLegality; hookService.shootingTargetForbidden)
  forbidsShootingTarget?(state: GameState, entry: HookSourceEntry, firingUnitId: UnitId, targetUnitId: UnitId): boolean
  // LRL-ENH Curved Shots: extra points range and visibility may be measured from for `shooterModelId`'s shooting attacks
  // (a target is legal from the model OR from any point; phases/shooting.ts targetLegality). null = no opinion
  extraShootingOrigins?(state: GameState, entry: HookSourceEntry, shooterModelId: ModelId): Vec2[] | null
  // LRL-RA-2 Roaring Headwind: every model of `unitId` must end any Move ability closer to this battlefield edge than it
  // started (MoveConstraints.mustEndCloserToEdge; movement.ts, charge.ts, aos-moves.ts slides/retreats). null = no opinion
  moveEdgeConstraint?(state: GameState, entry: HookSourceEntry, unitId: UnitId): EdgeRef | null
  // F10: an activated ability offered at the start of this phase (abilities.ts start-of-phase windows, e.g. 'chargeStart') instead
  // of where its data timing puts it (STD-ENH-3 Champion of Raids: "your Charge phase", whose data names the movement phase's end)
  startOfPhase?: Phase
}

// a battlefield edge: axis 'z' sign -1 = the edge at z = -h/2, axis 'x' sign 1 = the edge at x = +w/2 (types.ts EdgeRef)
export type { EdgeRef }


// ---------- reactions recorded for the phase modules ----------
export interface ReactionRequest {
  kind: ReactionKind | 'surge' | 'nextWave' | 'cultAmbush'
  stratagemId: string
  player: PlayerId
  // the reacting / moving friendly unit
  unitId: UnitId
  // the enemy unit that triggered it (overwatch target, charger, fought unit, shooter to move toward)
  enemyUnitId: UnitId | null
  window: TimingWindowId
  // surge: rolled distance (Krump da Gitz!)
  distance: number | null
}

const REACTION_PREFIX = 'reaction:'

export function pushReaction(ctx: EngineContext, r: ReactionRequest): void {
  ctx.state.phaseState.marks.push(REACTION_PREFIX + JSON.stringify(r))
}

export function pendingReactions(state: GameState, kind?: ReactionRequest['kind']): ReactionRequest[] {
  return state.phaseState.marks
    .filter((m) => m.startsWith(REACTION_PREFIX))
    .map((m) => JSON.parse(m.slice(REACTION_PREFIX.length)) as ReactionRequest)
    .filter((r) => kind === undefined || r.kind === kind)
}

// removes the first matching request (draft state only); returns it
export function consumeReaction(state: GameState, kind: ReactionRequest['kind'], unitId?: UnitId): ReactionRequest | null {
  const marks = state.phaseState.marks
  for (let i = 0; i < marks.length; i++) {
    if (!marks[i].startsWith(REACTION_PREFIX)) continue
    const r = JSON.parse(marks[i].slice(REACTION_PREFIX.length)) as ReactionRequest
    if (r.kind === kind && (unitId === undefined || r.unitId === unitId)) {
      marks.splice(i, 1)
      return r
    }
  }
  return null
}

// ---------- helpers ----------

function boardUnit(state: GameState, id: string | undefined): Unit | null {
  const u = id ? state.units[id] : undefined
  return u && u.location === 'board' ? u : null
}

function unitHasAny(state: GameState, unitId: UnitId, kw: string): boolean {
  return leaderService.halves(state, unitId).some((id) => keywordsOf(state, id).includes(kw))
}

function hasRangedWeapon(state: GameState, unitId: UnitId): boolean {
  return leaderService.halves(state, unitId).some((id) => state.units[id].location === 'board' && unitModels(state, id).some((m) => m.weapons.some((w) => state.weapons[w]?.kind === 'ranged')))
}

// R-6.7 Pistol: a model equipped with a Pistol may be selected to shoot (or Fire Overwatch) while its unit is in
// Engagement Range, targeting only the unit(s) it is engaged with.
function hasPistolWeapon(state: GameState, unitId: UnitId): boolean {
  return leaderService.halves(state, unitId).some((id) => state.units[id].location === 'board' && unitModels(state, id).some((m) =>
    m.weapons.some((wid) => {
      const w = state.weapons[wid]
      return !!w && w.kind === 'ranged' && hookService.weaponAbilitiesFor(state, m.id, w).some((a) => a.ability === 'PISTOL')
    })))
}

function isBigGunsUnit(state: GameState, unitId: UnitId): boolean {
  return unitHasAny(state, unitId, 'MONSTER') || unitHasAny(state, unitId, 'VEHICLE')
}

// ---------- stratagem hooks ----------
function notMovedAwayOrFled(u: Unit): boolean { return u.turn.moveType !== 'advance' && u.turn.moveType !== 'fallBack' }

// R-6.1 / R-6.2 / R-6.3 eligibility to shoot as if it were the unit's Shooting phase (Fire Overwatch)
export function eligibleToShootNow(state: GameState, unitId: UnitId): boolean {
  const u = boardUnit(state, unitId)
  if (!u) return false
  const halves = leaderService.halves(state, unitId).map((id) => state.units[id])
  if (halves.some((h) => h.turn.shotThisPhase || !notMovedAwayOrFled(h))) return false
  if (!hasRangedWeapon(state, unitId)) return false
  if (isBigGunsUnit(state, unitId)) return true
  if (!leaderService.inEngagementWithEnemy(state, unitId)) return true
  // R-6.2 / R-6.7 Pistol exception: otherwise an engaged unit may only be selected to shoot if it has a Pistol
  return hasPistolWeapon(state, unitId)
}

// true when any board model of the unit (attached unit included) is within the mission's objective range of the marker
export function unitWithinObjectiveRange(state: GameState, unitId: UnitId, obj: Objective): boolean {
  const models = leaderService.halves(state, unitId).flatMap((id) => state.units[id]?.location === 'board' ? unitModels(state, id) : [])
  const range = state.mission.data.objectiveRange ?? OBJECTIVE_RANGE
  const radius = state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  return models.some((m) => withinObjectiveRange(m, obj, 0, range, radius))
}

// every `code` name a Spearhead descriptor may use (src/data validates against these keys)
export const codeHooks: Record<string, EngineCodeHook> = {
  ...citiesHooks,
  ...ironjawzHooks,
  ...slavesHooks,
  ...fyreslayersHooks,
  ...luminethHooks,
  ...kharadronHooks,
  ...gloomspiteHooks,
  ...kruleboyzHooks,
  // core Spearhead abilities no data file names (Call for Reinforcements, SPH-12); abilities.ts adds their descriptor itself
  [spearheadCallForReinforcements.name]: spearheadCallForReinforcements,
}

export type { ChooseOptionDecision }
