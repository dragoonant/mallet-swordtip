// GameEvent union emitted by the reducer; the only channel to UI, dice log and AI (00-arch §5). JSON-serialisable.
import type {
  AttackKind, DiceRoll, GameResult, Id, ModelId, MoveType, ObjectiveId, OutOfPhaseMove, Path, PendingDecision,
  Phase, PlayerId, Rejection, RollPurpose, StratagemId, TimingWindowId, UnitId, Vec3, WeaponId,
} from './types'

export interface EventBase { seq: number; round: number; turn: PlayerId; phase: Phase; player: PlayerId }

// game
export interface GameCreated extends EventBase { type: 'GameCreated'; seed: string; engineVersion: string; dataVersion: string }
export interface RoundStarted extends EventBase { type: 'RoundStarted' }
export interface RoundEnded extends EventBase { type: 'RoundEnded' }
export interface TurnStarted extends EventBase { type: 'TurnStarted' }
export interface PhaseStarted extends EventBase { type: 'PhaseStarted' }
export interface PhaseEnded extends EventBase { type: 'PhaseEnded' }
export interface GameEnded extends EventBase { type: 'GameEnded'; result: GameResult }
export interface SidesChosen extends EventBase { type: 'SidesChosen'; attacker: PlayerId; defender: PlayerId }
export interface FirstTurnChosen extends EventBase { type: 'FirstTurnChosen'; first: PlayerId }
export interface UnitDeployed extends EventBase { type: 'UnitDeployed'; unitId: UnitId; toReserves: boolean }

// Spearhead round start (SPH-8.2–8.5; 13-port-plan §2.3). Round 1 emits only FirstTurnChosen; rounds 2+ emit PriorityRolled
// (after the winner's choice, so firstPlayer is known), then FirstTurnChosen, then InitiativeSeized when it applies.
// winner: null on a tie (chooser = whoever went first last round); doubleTurn: the new first player took the second turn last round
export interface PriorityRolled extends EventBase { type: 'PriorityRolled'; rolls: Record<PlayerId, number>; winner: PlayerId | null; chooser: PlayerId; firstPlayer: PlayerId; doubleTurn: boolean }
// SPH-8.4 (`underdog`, not `player`: EventBase.player is the envelope)
export interface UnderdogDetermined extends EventBase { type: 'UnderdogDetermined'; underdog: PlayerId | null }
// SPH-8.5: envelope `player` = the player who seized the initiative
export interface InitiativeSeized extends EventBase { type: 'InitiativeSeized' }

// Spearhead cards (SPH-9.4, SPH-10.7). TacticsDrawn carries a count only (the cards stay hidden from the opponent);
// discards and scored tactics are public. TwistPicked reports what a twist's picker chose (objectives / units / an effect).
export interface TwistDrawn extends EventBase { type: 'TwistDrawn'; cardId: Id; drawRound: number }
export interface TwistPicked extends EventBase { type: 'TwistPicked'; cardId: Id; objectiveId: ObjectiveId | null; unitId: UnitId | null; mode: string | null }
export interface TacticsDrawn extends EventBase { type: 'TacticsDrawn'; count: number }
export interface TacticDiscarded extends EventBase { type: 'TacticDiscarded'; cardId: Id }
export interface TacticScored extends EventBase { type: 'TacticScored'; cardId: Id; vp: number }
export interface TacticCommandUsed extends EventBase { type: 'TacticCommandUsed'; cardId: Id; unitId: UnitId | null; summary: string }

// command
export interface CpChanged extends EventBase { type: 'CpChanged'; delta: number; total: number; source: string }
export interface BattleShockTested extends EventBase { type: 'BattleShockTested'; unitId: UnitId; roll: number; ld: number; passed: boolean }
export interface BattleShocked extends EventBase { type: 'BattleShocked'; unitId: UnitId }
export interface BattleShockRecovered extends EventBase { type: 'BattleShockRecovered'; unitId: UnitId }
export interface OathTargetChosen extends EventBase { type: 'OathTargetChosen'; unitId: UnitId }
export interface WaaaghCalled extends EventBase { type: 'WaaaghCalled' }

// movement
export interface MoveDeclared extends EventBase { type: 'MoveDeclared'; unitId: UnitId; moveType: MoveType }
export interface UnitMoved extends EventBase {
  type: 'UnitMoved'
  unitId: UnitId
  moveType: MoveType | OutOfPhaseMove
  paths: Record<ModelId, Path>
}
export interface UnitAdvanced extends EventBase { type: 'UnitAdvanced'; unitId: UnitId; roll: number }
export interface UnitFellBack extends EventBase { type: 'UnitFellBack'; unitId: UnitId }
export interface UnitRemainedStationary extends EventBase { type: 'UnitRemainedStationary'; unitId: UnitId }
export interface DesperateEscapeRolled extends EventBase { type: 'DesperateEscapeRolled'; unitId: UnitId; dice: number[]; casualties: number }
export interface ReinforcementsArrived extends EventBase { type: 'ReinforcementsArrived'; unitId: UnitId; via: 'deepStrike' | 'strategicReserves' | 'rapidIngress' | 'nextWave' | 'teleportAssault' }
export interface UnitRemovedFromBattlefield extends EventBase { type: 'UnitRemovedFromBattlefield'; unitId: UnitId; source: string }
export interface UnitLostInReserves extends EventBase { type: 'UnitLostInReserves'; unitId: UnitId }
export interface CoherencyCulled extends EventBase { type: 'CoherencyCulled'; unitId: UnitId; modelIds: ModelId[] }

// shooting / fight
export interface AttackSequenceStarted extends EventBase { type: 'AttackSequenceStarted'; unitId: UnitId; kind: AttackKind; overwatch: boolean }
export interface TargetsDeclared extends EventBase {
  type: 'TargetsDeclared'
  unitId: UnitId
  targets: { modelId: ModelId; weaponId: WeaponId; targetUnitId: UnitId }[]
}
export interface AttackRollContext { attackerUnitId: UnitId; attackerModelId: ModelId; weaponId: WeaponId; targetUnitId: UnitId }
export interface HitRolled extends EventBase { type: 'HitRolled'; attack: AttackRollContext; die: number; final: number; hit: boolean; critical: boolean; extraHits: number; auto: boolean; rollId?: string; dieIndex?: number }
export interface WoundRolled extends EventBase { type: 'WoundRolled'; attack: AttackRollContext; die: number; final: number; needed: number; wounded: boolean; critical: boolean; auto: boolean; rollId?: string; dieIndex?: number }
export interface AttackAllocated extends EventBase { type: 'AttackAllocated'; attack: AttackRollContext; modelId: ModelId; cover: boolean }
export interface SaveRolled extends EventBase { type: 'SaveRolled'; attack: AttackRollContext; modelId: ModelId; kind: 'armour' | 'invuln' | 'none'; die: number; final: number; needed: number; saved: boolean; rollId?: string; dieIndex?: number }
export interface DamageApplied extends EventBase { type: 'DamageApplied'; unitId: UnitId; modelId: ModelId; amount: number; mortal: boolean; woundsRemaining: number; source: AttackRollContext | { abilityId: Id } | { stratagemId: StratagemId } }
// AoS damage pool (CORE-13): one per target unit after an attack's damage is allocated; points = damage points in the pool,
// warded = points cancelled by ward rolls, slain = models slain. Ward rolls themselves reuse FeelNoPainRolled.
export interface DamagePoolResolved extends EventBase { type: 'DamagePoolResolved'; unitId: UnitId; points: number; warded: number; slain: number }
// SPH-12 (P1): a replacement unit was set up for a destroyed Reinforcements unit
export interface UnitReplaced extends EventBase { type: 'UnitReplaced'; unitId: UnitId; replacementOf: UnitId }
export interface FeelNoPainRolled extends EventBase { type: 'FeelNoPainRolled'; unitId: UnitId; modelId: ModelId; die: number; needed: number; ignored: boolean }
// byModelId: the attacking model for ranged/melee kills; null for mortal wounds, Deadly Demise, coherency culls
export interface ModelDestroyed extends EventBase { type: 'ModelDestroyed'; unitId: UnitId; modelId: ModelId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null; kind: AttackKind | 'mortal' | 'other' }
export interface UnitDestroyed extends EventBase { type: 'UnitDestroyed'; unitId: UnitId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null; kind: AttackKind | 'mortal' | 'other' }
export interface HazardousTested extends EventBase { type: 'HazardousTested'; unitId: UnitId; weaponId: WeaponId; die: number; failed: boolean; modelId: ModelId | null }
export interface DeadlyDemiseRolled extends EventBase { type: 'DeadlyDemiseRolled'; unitId: UnitId; modelId: ModelId; die: number; exploded: boolean; affected: UnitId[] }
export interface AttackSequenceEnded extends EventBase { type: 'AttackSequenceEnded'; unitId: UnitId; kind: AttackKind }
export interface LeaderDetached extends EventBase { type: 'LeaderDetached'; leaderId: UnitId; bodyguardId: UnitId; survivor: UnitId }

// charge
export interface ChargeDeclared extends EventBase { type: 'ChargeDeclared'; unitId: UnitId; targetUnitIds: UnitId[]; heroic: boolean }
export interface ChargeRolled extends EventBase { type: 'ChargeRolled'; unitId: UnitId; dice: [number, number]; total: number; needed: number | null }
export interface ChargeFailed extends EventBase { type: 'ChargeFailed'; unitId: UnitId }
export interface ChargeMoved extends EventBase { type: 'ChargeMoved'; unitId: UnitId; paths: Record<ModelId, Path> }
export interface PiledIn extends EventBase { type: 'PiledIn'; unitId: UnitId; paths: Record<ModelId, Path> }
export interface Consolidated extends EventBase { type: 'Consolidated'; unitId: UnitId; paths: Record<ModelId, Path> }
export interface FightUnitSelected extends EventBase { type: 'FightUnitSelected'; unitId: UnitId; step: 'fightsFirst' | 'remaining' }

// stratagem / ability
export interface StratagemUsed extends EventBase { type: 'StratagemUsed'; stratagemId: StratagemId; cost: number; targets: { unitIds: UnitId[]; modelIds: ModelId[]; objectiveId: ObjectiveId | null } }
export interface StratagemWindowOpened extends EventBase { type: 'StratagemWindowOpened'; window: TimingWindowId; usable: StratagemId[] }
export interface StratagemWindowClosed extends EventBase { type: 'StratagemWindowClosed'; window: TimingWindowId; used: StratagemId | null }
export interface AbilityTriggered extends EventBase { type: 'AbilityTriggered'; abilityId: Id; sourceUnitId: UnitId | null; targetUnitId: UnitId | null; summary: string }
// Reanimation Protocols (necrons): a wound regained / a destroyed model put back (docs/spec/factions/necrons.md NEC-2.2)
export interface WoundsRegained extends EventBase { type: 'WoundsRegained'; unitId: UnitId; modelId: ModelId; amount: number; source: Id }
export interface ModelReturned extends EventBase { type: 'ModelReturned'; unitId: UnitId; modelId: ModelId; pos: Vec3; source: Id }
// Death Blow (tyranids) and A Martyr's Death (adepta sororitas): the model is not removed yet; ModelDestroyed follows once it has fought/shot or declined
export interface ModelRemovalDeferred extends EventBase { type: 'ModelRemovalDeferred'; unitId: UnitId; modelId: ModelId; source: Id }
// Adepta Sororitas (E1): Miracle dice gained / spent
export interface MiracleDieGained extends EventBase { type: 'MiracleDieGained'; player: PlayerId; value: number; source: string }
export interface MiracleDieSpent extends EventBase {
  type: 'MiracleDieSpent'; player: PlayerId; value: number; mode: 'substitute' | 'discard'
  unitId: UnitId | null; rollId: string | null; purpose: RollPurpose | null; source: string
}
export interface EffectExpired extends EventBase { type: 'EffectExpired'; effectId: string; unitId: UnitId | null }

// dice: one per physical roll, always emitted even when a family event covers it
export interface DiceRolled extends EventBase { type: 'DiceRolled'; roll: DiceRoll }
export interface DiceRerolled extends EventBase { type: 'DiceRerolled'; rollId: string; source: 'commandReroll' | Id; before: number[]; after: number[]; indexes?: number[] }

// objectives
export interface ObjectiveControlChanged extends EventBase { type: 'ObjectiveControlChanged'; objectiveId: ObjectiveId; from: PlayerId | null; to: PlayerId | null; levels: Record<PlayerId, number> }
export interface ObjectiveSecured extends EventBase { type: 'ObjectiveSecured'; objectiveId: ObjectiveId; by: PlayerId | null; flag: 'secured' | 'sticky' }
export interface ObjectiveRemoved extends EventBase { type: 'ObjectiveRemoved'; objectiveId: ObjectiveId; reason: string }
export interface VpScored extends EventBase { type: 'VpScored'; source: string; amount: number; total: number }

// meta
export interface ActionRejected extends EventBase { type: 'ActionRejected'; rejection: Rejection }
export interface DecisionRequested extends EventBase { type: 'DecisionRequested'; pending: PendingDecision }

export type GameEvent =
  | GameCreated | RoundStarted | RoundEnded | TurnStarted | PhaseStarted | PhaseEnded | GameEnded | SidesChosen | FirstTurnChosen | UnitDeployed
  | PriorityRolled | UnderdogDetermined | InitiativeSeized | DamagePoolResolved | UnitReplaced
  | TwistDrawn | TwistPicked | TacticsDrawn | TacticDiscarded | TacticScored | TacticCommandUsed
  | CpChanged | BattleShockTested | BattleShocked | BattleShockRecovered | OathTargetChosen | WaaaghCalled
  | MoveDeclared | UnitMoved | UnitAdvanced | UnitFellBack | UnitRemainedStationary | DesperateEscapeRolled | ReinforcementsArrived | UnitRemovedFromBattlefield | UnitLostInReserves | CoherencyCulled
  | AttackSequenceStarted | TargetsDeclared | HitRolled | WoundRolled | AttackAllocated | SaveRolled | DamageApplied | FeelNoPainRolled
  | ModelDestroyed | UnitDestroyed | HazardousTested | DeadlyDemiseRolled | AttackSequenceEnded | LeaderDetached
  | ChargeDeclared | ChargeRolled | ChargeFailed | ChargeMoved | PiledIn | Consolidated | FightUnitSelected
  | StratagemUsed | StratagemWindowOpened | StratagemWindowClosed | AbilityTriggered | WoundsRegained | ModelReturned | MiracleDieGained | MiracleDieSpent | ModelRemovalDeferred | EffectExpired
  | DiceRolled | DiceRerolled
  | ObjectiveControlChanged | ObjectiveSecured | ObjectiveRemoved | VpScored
  | ActionRejected | DecisionRequested

export type GameEventType = GameEvent['type']
