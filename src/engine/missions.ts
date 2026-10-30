// Spearhead scoring and the end of the battle (SPH-11, CORE-4.14). The three objective rules (sph.vp.holdOne /
// holdTwo / holdMore) are scored by the active player at the turn.end.scoring window, after objective control has been
// worked out (SPH-8.6); the reducer never opens the legacy `turn.end` window, so mission data that still says
// when: 'turn.end' is scored at turn.end.scoring. Reserve units still off the table at the start of round 4 are
// destroyed at the round.start window of round 4. There are no mission rules, secondaries or early endings here.
import type { ScoringRule, TimingWindowId } from '../data/types'
import type { DecisionHandler, EngineContext, WindowTrigger } from './modules'
import { removeModel } from './state'
import type { AttackKind, GameResult, GameState, ModelId, ObjectiveId, PlayerId, UnitId } from './types'

export interface ModelDestroyedInfo {
  unitId: UnitId; modelId: ModelId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null
}

export interface MissionService {
  onWindow(ctx: EngineContext, window: TimingWindowId, key: string, trigger?: WindowTrigger): void
  // SPH-11.3: a tabled player keeps taking empty turns, so this is always true
  playerHasForces(state: GameState, player: PlayerId): boolean
  // never: there is no early end (SPH-11.3)
  isTabled(state: GameState): boolean
  // SPH-11.3: more VP wins, equal VP is a draw
  finalResult(state: GameState, reason: GameResult['reason']): GameResult
  // kept optional for the attack module's call sites (nothing to do in Spearhead)
  unitDestroyed?(ctx: EngineContext, info: { unitId: UnitId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: string | null; kind?: AttackKind | 'mortal' | 'other'; rangedAttack?: boolean }): void
  modelDestroyed?(ctx: EngineContext, info: ModelDestroyedInfo): void
  // the old 40k mission topics are gone; this handler rejects anything routed to it
  readonly handler: DecisionHandler
}

// CORE-4.14 / SPH-7.3
export const RESERVE_DEADLINE_ROUND = 4

// the default Spearhead rules (SPH-11.1, SPH-11.4), used when a Spearhead battleplan lists none of its own
const DEFAULT_RULES: ScoringRule[] = ['sph.vp.holdOne', 'sph.vp.holdTwo', 'sph.vp.holdMore'].map((code) => ({
  id: code, when: 'turn.end', rounds: { from: 1, to: 4 }, who: 'active', rule: 'custom', code, pointsPer: 1, cap: 1,
}))

function awardVp(ctx: EngineContext, pid: PlayerId, amount: number, source: string): void {
  if (amount <= 0) return
  const p = ctx.state.players[pid]
  p.vp += amount
  p.vpBySource[source] = (p.vpBySource[source] ?? 0) + amount
  ctx.emit({ type: 'VpScored', source, amount, total: p.vp, player: pid })
  ctx.state.mission.scored.push({ ruleId: source, player: pid, round: ctx.state.round, turn: ctx.state.activePlayer, amount })
}

// kept for callers that still deduct VP (floored so a source never goes below 0). Returns the VP actually removed.
export function deductVp(ctx: EngineContext, pid: PlayerId, amount: number, source: string): number {
  const p = ctx.state.players[pid]
  const removed = Math.min(amount, p.vpBySource[source] ?? 0)
  if (removed <= 0) return 0
  p.vp -= removed
  p.vpBySource[source] -= removed
  ctx.emit({ type: 'VpScored', source, amount: -removed, total: p.vp, player: pid })
  ctx.state.mission.scored.push({ ruleId: source, player: pid, round: ctx.state.round, turn: ctx.state.activePlayer, amount: -removed })
  return removed
}

// who controls the marker now (control is sticky and evaluated by objectives.ts; nothing is recomputed here)
export function liveController(ctx: EngineContext, id: ObjectiveId): PlayerId | null {
  const obj = ctx.state.objectives[id]
  return obj && !obj.removed ? obj.controller : null
}

function controlledBy(s: GameState, pid: PlayerId): number {
  return Object.values(s.objectives).filter((o) => !o.removed && o.controller === pid).length
}

function appliesTo(who: ScoringRule['who'], pid: PlayerId, s: GameState): boolean {
  switch (who ?? 'active') {
    case 'active': return pid === s.activePlayer
    case 'opponent': return pid !== s.activePlayer
    case 'both': return true
    case 'first': return pid === s.firstPlayer
    case 'second': return pid !== s.firstPlayer
  }
}

// points one scoring rule gives `pid` right now
function amountFor(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const mine = controlledBy(s, pid)
  const theirs = controlledBy(s, pid === 'A' ? 'B' : 'A')
  let hit = false
  switch (rule.code) {
    case 'sph.vp.holdOne': hit = mine >= 1; break
    case 'sph.vp.holdTwo': hit = mine >= 2; break
    case 'sph.vp.holdMore': hit = mine > theirs; break
    default: return 0 // sph.vp.tactic: tactic cards are P2
  }
  return hit ? Math.min(rule.pointsPer, rule.cap > 0 ? rule.cap : rule.pointsPer) : 0
}

// SPH-11.1: the active player scores at the end of their own turn
function scoreTurn(ctx: EngineContext): void {
  const s = ctx.state
  const listed = s.mission.scoring.filter((r) => r.rule === 'custom' && typeof r.code === 'string' && r.code.startsWith('sph.vp.'))
  const rules = listed.length > 0 ? listed : s.mission.data.format === 'spearhead' ? DEFAULT_RULES : []
  for (const pid of ['A', 'B'] as PlayerId[]) {
    for (const rule of rules) {
      if (s.round < rule.rounds.from || s.round > rule.rounds.to) continue
      if (!appliesTo(rule.who, pid, s)) continue
      awardVp(ctx, pid, amountFor(s, rule, pid), rule.id)
    }
  }
}

// CORE-4.14: every unit still in reserve at the start of round 4 is destroyed
function destroyReserves(ctx: EngineContext): void {
  const s = ctx.state
  for (const unit of Object.values(s.units)) {
    if (unit.location !== 'reserves') continue
    for (const id of [...unit.models]) if (s.models[id]) removeModel(s, id)
    unit.location = 'destroyed'
    ctx.emit({ type: 'UnitDestroyed', unitId: unit.id, byPlayer: null, byUnitId: null, byModelId: null, kind: 'other', player: unit.player })
  }
}

export const missionService: MissionService = {
  onWindow(ctx, window) {
    const s = ctx.state
    if (window === 'round.start' && s.round === RESERVE_DEADLINE_ROUND && ctx.once('missions:reserves')) destroyReserves(ctx)
    if (window === 'turn.end.scoring' && ctx.once(`missions:score:${s.round}:${s.activePlayer}`)) scoreTurn(ctx)
  },
  playerHasForces: () => true,
  isTabled: () => false,
  finalResult(state, reason) {
    const vp = { A: state.players.A.vp + (state.players.A.battleReadyVp ?? 0), B: state.players.B.vp + (state.players.B.battleReadyVp ?? 0) }
    const winner: GameResult['winner'] = vp.A > vp.B ? 'A' : vp.B > vp.A ? 'B' : 'draw'
    return { winner, reason, vp }
  },
  handler: {
    handle: () => ({ code: 'E_NOT_AN_OPTION', reason: 'missions: Spearhead battleplans raise no decisions of their own' }),
  },
}
