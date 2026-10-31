// Ability hook system: named hook points, context objects, modifier results, descriptor → hook mapping (20-data §3).
import type { AbilityDescriptor, Effect, Trigger } from '../data/types'
import type {
  AbilityId, AttackKind, DiceRoll, GameState, Id, ModelId, MoveType, OutOfPhaseMove, Phase, PlayerId, RollPurpose,
  RuntimeWeapon, StratagemId, UnitId, ObjectiveId,
} from './types'
import type { EngineContext } from './modules'

export type HookName =
  | 'onPhaseStart' | 'onPhaseEnd' | 'onTurnStart' | 'onTurnEnd' | 'onCommandPhase'
  | 'onBattleShockTest' | 'onAdvanceRoll' | 'onChargeRoll' | 'onMove' | 'onCharge'
  | 'onUnitSelectedToShoot' | 'onUnitSelectedToFight' | 'onTargetsDeclared' | 'onAttacksAllocated'
  | 'onAttackCount' | 'onHitRoll' | 'onWoundRoll' | 'onSaveRoll' | 'onDamageRoll' | 'onFeelNoPainRoll'
  | 'onDamage' | 'onModelDestroyed' | 'onUnitDestroyed' | 'onDeployment' | 'onReinforcements'
  | 'onObjectiveControl' | 'onStatQuery' | 'onEligibility'
  // AoS (P1): an activated ability was declared (reaction trigger, e.g. A Proper Ruckus)
  | 'onAbilityDeclared'

// where an effect comes from, for logging and once-per limits
export interface EffectSource {
  kind: 'ability' | 'stratagem' | 'enhancement' | 'core' | 'weaponAbility'
  id: AbilityId | StratagemId | Id
  unitId: UnitId | null
  modelId: ModelId | null
}

export interface HookContextBase {
  state: GameState
  phase: Phase
  activePlayer: PlayerId
  source: EffectSource
  // the unit the descriptor is attached to
  unitId: UnitId | null
}

export interface AttackContext {
  kind: AttackKind
  overwatch: boolean
  attackerUnitId: UnitId
  attackerModelId: ModelId
  weapon: RuntimeWeapon
  targetUnitId: UnitId
  targetModelId: ModelId | null
  range: number
  halfRange: boolean
  inCover: boolean
  charged: boolean
  oathTarget: boolean
  attackerInEngagement: boolean
}

export interface RollContext { purpose: RollPurpose; roll: DiceRoll; dieIndex: number; unmodified: number; rerolled: boolean }

export interface PhaseHookContext extends HookContextBase { hook: 'onPhaseStart' | 'onPhaseEnd' | 'onTurnStart' | 'onTurnEnd' | 'onCommandPhase' }
export interface BattleShockHookContext extends HookContextBase { hook: 'onBattleShockTest'; testUnitId: UnitId; roll: RollContext | null }
export interface AdvanceRollHookContext extends HookContextBase { hook: 'onAdvanceRoll'; movingUnitId: UnitId; roll: RollContext }
export interface ChargeRollHookContext extends HookContextBase { hook: 'onChargeRoll'; chargingUnitId: UnitId; targetUnitIds: UnitId[]; roll: RollContext }
export interface MoveHookContext extends HookContextBase { hook: 'onMove'; movingUnitId: UnitId; moveType: MoveType | OutOfPhaseMove; distance: number }
export interface ChargeHookContext extends HookContextBase { hook: 'onCharge'; chargingUnitId: UnitId; targetUnitIds: UnitId[]; stage: 'declared' | 'moved' | 'failed' }
export interface UnitSelectedHookContext extends HookContextBase { hook: 'onUnitSelectedToShoot' | 'onUnitSelectedToFight'; selectedUnitId: UnitId }
export interface TargetsDeclaredHookContext extends HookContextBase { hook: 'onTargetsDeclared'; attackerUnitId: UnitId; targetUnitIds: UnitId[]; kind: AttackKind }
export interface AttacksAllocatedHookContext extends HookContextBase { hook: 'onAttacksAllocated'; attack: AttackContext }
export interface AttackCountHookContext extends HookContextBase { hook: 'onAttackCount'; attack: AttackContext; attacks: number }
// mortal: set only for onFeelNoPainRoll — true when the point being saved is a mortal wound (Condition.mortalWound)
export interface AttackRollHookContext extends HookContextBase { hook: 'onHitRoll' | 'onWoundRoll' | 'onSaveRoll' | 'onDamageRoll' | 'onFeelNoPainRoll'; attack: AttackContext; roll: RollContext; mortal?: boolean; psychicSource?: boolean }
export interface DamageHookContext extends HookContextBase { hook: 'onDamage'; attack: AttackContext | null; targetUnitId: UnitId; targetModelId: ModelId; damage: number; mortal: boolean }
export interface DestroyedHookContext extends HookContextBase { hook: 'onModelDestroyed' | 'onUnitDestroyed'; destroyedUnitId: UnitId; destroyedModelId: ModelId | null; byUnitId: UnitId | null; byModelId: ModelId | null; kind: AttackKind | 'mortal' | 'other' }
export interface DeploymentHookContext extends HookContextBase { hook: 'onDeployment' | 'onReinforcements'; deployingUnitId: UnitId }
// AoS (IJZ-5.4.1, CORE-17.4): asked per contesting unit with `contestingUnitId` + its summed `controlScore`; a StatModifierResult
// adjusts that unit's score (the caller floors it at 1). Without contestingUnitId it is the legacy per-objective call.
export interface ObjectiveHookContext extends HookContextBase { hook: 'onObjectiveControl'; objectiveId: ObjectiveId; levels: Record<PlayerId, number>; contestingUnitId?: UnitId | null; controlScore?: number }
export interface StatQueryHookContext extends HookContextBase { hook: 'onStatQuery'; queryUnitId: UnitId; queryModelId: ModelId | null; weapon: RuntimeWeapon | null; stat: NonNullable<Effect['modifyStat']>['stat'] }
// AoS: 'contest' = may contest objectives (IJZ-5.4.1); 'strikeFirst' = alias of fightFirst for new data
export interface EligibilityHookContext extends HookContextBase { hook: 'onEligibility'; queryUnitId: UnitId; check: 'shoot' | 'charge' | 'fightFirst' | 'stationaryBonus' | 'surge' | 'contest' | 'strikeFirst' }
export interface AbilityDeclaredHookContext extends HookContextBase { hook: 'onAbilityDeclared'; use: AbilityUse }

export type HookContext =
  | PhaseHookContext | BattleShockHookContext | AdvanceRollHookContext | ChargeRollHookContext | MoveHookContext | ChargeHookContext
  | UnitSelectedHookContext | TargetsDeclaredHookContext | AttacksAllocatedHookContext | AttackCountHookContext | AttackRollHookContext
  | DamageHookContext | DestroyedHookContext | DeploymentHookContext | ObjectiveHookContext | StatQueryHookContext | EligibilityHookContext
  | AbilityDeclaredHookContext

export type HookContextFor<K extends HookName> = Extract<HookContext, { hook: K }>

// ---------- results ----------
export type RerollKind = 'ones' | 'fails' | 'all' | 'oneDie'

// returned by roll hooks; engine sums modifiers then clamps hit/wound to ±1 and save improvement to +1
export interface RollModifierResult {
  kind: 'roll'
  modifier?: number
  reroll?: RerollKind
  autoPass?: boolean
  autoFail?: boolean
  ignoreModifiers?: boolean
  critThreshold?: number
  ignoreCover?: boolean
  armourOnly?: boolean // onSaveRoll only: the modifier applies to an armour save, never to an invulnerable save (Half-chewed)
  invuln?: number
  feelNoPain?: number
  // honoured for onBattleShockTest only: extra dice rolled on top of the usual 2D6 (Tyranid Synapse)
  extraDice?: number
  // onWoundRoll: AP improves by this much for an attack whose unmodified wound roll was a critical wound (ADE Ascetic Discipline)
  critWoundAp?: number
  // F12 (SBG-ENH Aura of Night, Effect.ignoreNegativeModifiers): negative modifiers to this roll are dropped; F14: on a save roll
  // that includes Rend (core 17.0). ignoreModifiers on a save roll drops every modifier and Rend
  ignoreNegative?: boolean
  // F16 (Effect.onlySixes): the roll succeeds only on an unmodified 6 (attack.ts runStage)
  onlySix?: boolean
}
export interface StatModifierResult { kind: 'stat'; delta?: number; set?: number; cap?: number; halve?: boolean }
export interface AttackCountResult { kind: 'attacks'; delta?: number }
export interface DamageModifierResult { kind: 'damage'; delta?: number; halve?: boolean; reduction?: number; set?: number }
export interface EligibilityResult { kind: 'eligibility'; allow?: boolean; deny?: boolean }
export interface MoveModifierResult { kind: 'move'; extraDistance?: number; forbid?: boolean }
// side effects a hook asks the engine to perform (engine applies them and emits events)
export interface EffectRequest {
  kind: 'request'
  mortalWounds?: { targetUnitId: UnitId; count: number }[]
  cp?: number
  vp?: { amount: number; source: string }
  battleShockTest?: UnitId[]
  openDecision?: { topic: string; unitId: UnitId | null; options: string[] }
  grantEffect?: { unitId: UnitId; effect: Effect; duration: AbilityDescriptor['duration'] }
  // onModelDestroyed: the model stays on the table (0 W, cannot be targeted, no OC) until `afterUnitId` finishes its
  // shooting / fight activation; deferred models then shoot/fight once more and are removed (A Martyr's Death, ADE-025)
  deferRemoval?: { kind: 'ranged' | 'melee'; afterUnitId: UnitId }
  log?: string
}
export type HookResult =
  | RollModifierResult | StatModifierResult | AttackCountResult | DamageModifierResult | EligibilityResult | MoveModifierResult | EffectRequest

export type HookResultFor<K extends HookName> =
  K extends 'onHitRoll' | 'onWoundRoll' | 'onSaveRoll' | 'onDamageRoll' | 'onFeelNoPainRoll' | 'onBattleShockTest' | 'onAdvanceRoll' | 'onChargeRoll'
    ? RollModifierResult | EffectRequest
    : K extends 'onStatQuery' ? StatModifierResult
    : K extends 'onAttackCount' ? AttackCountResult
    : K extends 'onDamage' ? DamageModifierResult | EffectRequest
    : K extends 'onEligibility' ? EligibilityResult
    : K extends 'onMove' ? MoveModifierResult | EffectRequest
    : K extends 'onObjectiveControl' ? StatModifierResult | EffectRequest
    : EffectRequest

export type HookFn<K extends HookName = HookName> = (ctx: HookContextFor<K>) => HookResultFor<K> | HookResultFor<K>[] | void

// one use of an activated ability (PORT-0.7): built by abilities.ts after Declare (targets, mode, the declared roll) and
// handed to CodeHook.activate.resolve
export interface AbilityUse {
  abilityId: AbilityId
  // the unit using the ability; null for player-wide abilities (regiment abilities, battle traits without a unit)
  unitId: UnitId | null
  player: PlayerId
  targetUnitIds: UnitId[]
  modeId: string | null
  // the declared roll (AbilityDescriptor.roll), null when the ability declares none
  roll: DiceRoll | null
}

// the contract abilities.ts calls for an activated ability whose descriptor `code` names this hook (13-port-plan §2.4)
export interface ActivatedAbilityHook {
  // extra gate on top of timing / limits (e.g. "a unit that has not charged"); `use` holds what is known at the time
  canUse(state: GameState, unitId: UnitId | null, use: Partial<AbilityUse>): boolean
  // legal targets (the declare step offers them as abilityTarget options); absent = no targets
  targets?(state: GameState, unitId: UnitId | null): UnitId[]
  // "choose one" modes (abilityMode options); absent = descriptor.modes or none
  modes?: { id: string; label: string }[]
  // apply the effect (emit events, grant effects, queue mortal damage …)
  resolve(ctx: EngineContext, use: AbilityUse): void
}

// bespoke `code` hook, registered by name in src/engine/code-hooks.ts; `estimate` feeds the AI damage calculator
export interface CodeHook<K extends HookName = HookName> {
  name: string
  hook: K
  run: HookFn<K>
  estimate?: (ctx: HookContextFor<K>) => Partial<Record<'hitMod' | 'woundMod' | 'saveMod' | 'damageMult' | 'attacksDelta', number>>
  // AoS activated ability (PORT-0.7)
  activate?: ActivatedAbilityHook
}
export type HookRegistry = Record<string, CodeHook>

// ---------- declarative descriptor → hook mapping ----------
export const TRIGGER_HOOK: Record<Trigger, HookName> = {
  always: 'onStatQuery',
  phaseStart: 'onPhaseStart',
  phaseEnd: 'onPhaseEnd',
  turnStart: 'onTurnStart',
  turnEnd: 'onTurnEnd',
  commandPhase: 'onCommandPhase',
  battleShockTest: 'onBattleShockTest',
  advanceRoll: 'onAdvanceRoll',
  chargeRoll: 'onChargeRoll',
  unitMoved: 'onMove',
  unitSelectedToShoot: 'onUnitSelectedToShoot',
  unitSelectedToFight: 'onUnitSelectedToFight',
  targetsDeclared: 'onTargetsDeclared',
  attacksAllocated: 'onAttacksAllocated',
  hitRoll: 'onHitRoll',
  woundRoll: 'onWoundRoll',
  saveRoll: 'onSaveRoll',
  damageRoll: 'onDamageRoll',
  feelNoPainRoll: 'onFeelNoPainRoll',
  damageApplied: 'onDamage',
  modelDestroyed: 'onModelDestroyed',
  unitDestroyed: 'onUnitDestroyed',
  deployment: 'onDeployment',
  reinforcements: 'onReinforcements',
  objectiveControl: 'onObjectiveControl',
  // never dispatched: activated abilities are run by abilities.ts (hooks-impl skips `activated` descriptors)
  activated: 'onAbilityDeclared',
}

// which hooks each Effect key is evaluated at, independent of the descriptor's trigger (e.g. `always` + invuln)
export const EFFECT_HOOKS: Record<keyof Effect, HookName[]> = {
  when: [],
  reroll: ['onHitRoll', 'onWoundRoll', 'onSaveRoll', 'onDamageRoll', 'onChargeRoll', 'onAdvanceRoll', 'onBattleShockTest'],
  modifyRoll: ['onHitRoll', 'onWoundRoll', 'onSaveRoll', 'onDamageRoll', 'onChargeRoll', 'onAdvanceRoll', 'onBattleShockTest'],
  modifyStat: ['onStatQuery'],
  halveStat: ['onStatQuery'],
  halveRoll: ['onAdvanceRoll'],
  forbid: ['onEligibility'],
  setStat: ['onStatQuery'],
  invuln: ['onSaveRoll'],
  feelNoPain: ['onFeelNoPainRoll'],
  ignoreCover: ['onSaveRoll'],
  // F14: 'save' (NH-BT-1 Ethereal) answers at onSaveRoll, defender side; the save stage then drops Rend as well
  ignoreModifiers: ['onHitRoll', 'onWoundRoll', 'onSaveRoll'],
  autoResult: ['onHitRoll', 'onWoundRoll', 'onSaveRoll', 'onBattleShockTest', 'onChargeRoll', 'onAdvanceRoll'],
  grantWeaponAbility: ['onStatQuery'],
  grantKeyword: ['onStatQuery'],
  extraAttacks: ['onAttackCount'],
  mortalWounds: ['onHitRoll', 'onWoundRoll', 'onDamage'],
  damageReduction: ['onDamage'],
  halveDamage: ['onDamage'],
  cp: ['onCommandPhase', 'onPhaseEnd', 'onTurnEnd'],
  vp: ['onPhaseEnd', 'onTurnEnd', 'onCommandPhase'],
  move: ['onMove'],
  fightsFirst: ['onEligibility'],
  fightsLast: ['onEligibility'],
  shootAfterAdvance: ['onEligibility'],
  shootAfterFallBack: ['onEligibility'],
  chargeAfterAdvance: ['onEligibility'],
  chargeAfterFallBack: ['onEligibility'],
  stealth: ['onHitRoll'],
  lethalOn: ['onHitRoll'],
  critWoundAp: ['onWoundRoll'],
  // INF-5.6: read directly by movement.ts / charge.ts, never through a hook
  moveThroughModels: [],
  autoPassDesperateEscape: [],
  // STD-RA-2: read directly by phases/movement.ts (unitIgnoresRetreatDamage)
  noRetreatDamage: [],
  // KRU-RA-1: read directly by los.ts (hiddenBeyondFor)
  hiddenBeyond: [],
  // GLO-AB-1: a flag on a modifyStat entry, read by statFor (companionOnly queries)
  affectsCompanion: [],
  // F12: read directly by phases/charge.ts (hookService.chargeDiceBonus) and movement.ts / charge.ts path checks (passAcrossKeywords)
  extraChargeDice: [],
  passAcrossKeyword: [],
  // F12: a roll-hook result ({ kind: 'roll', ignoreNegative }) at the named roll's hook
  ignoreNegativeModifiers: ['onHitRoll', 'onWoundRoll', 'onSaveRoll', 'onChargeRoll', 'onFeelNoPainRoll'],
  // F16 (IDK-ENH Mind Flare): a roll-hook result ({ kind: 'roll', onlySix }) at the holder's hit roll
  onlySixes: ['onHitRoll'],
}

// hooks a descriptor must be registered at: its trigger's hook plus every hook its effect keys need
export function hooksForDescriptor(descriptor: AbilityDescriptor): HookName[] {
  const out = new Set<HookName>([TRIGGER_HOOK[descriptor.trigger]])
  const effects = descriptor.effect === undefined ? [] : Array.isArray(descriptor.effect) ? descriptor.effect : [descriptor.effect]
  for (const e of effects) {
    for (const key of Object.keys(e) as (keyof Effect)[]) for (const h of EFFECT_HOOKS[key] ?? []) out.add(h)
  }
  return [...out]
}
