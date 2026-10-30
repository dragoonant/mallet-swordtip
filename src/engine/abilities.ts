// Generic activated-ability service (13-engine-port-plan PORT-0.7, CORE-3.13). One loop serves every "Your / Enemy / Any
// <phase>", Start / End of Turn, Start / End of Round and deployment ability: phase modules and the reducer call
// `runWindow(ctx, window, player)` and return 'pending' while it says a decision is open.
//
// An ability is *activated* when its descriptor has trigger 'activated' and a `timing`; its behaviour is the `activate`
// block of the code hook its descriptor names (`code`). Sources: the datasheet abilities and enhancements of the player's
// units on the table (user = that unit), and the regiment ability and battle traits (user = the army, unitId null).
//
// Flow of one use (CORE-3.2): pick (chooseOption 'abilityUse', with a pass option) -> target ('abilityTarget', skipped when
// the hook offers exactly one) -> the declared roll (ctx.rollOnce; a failed roll still uses the ability up) -> mode
// ('abilityMode', skipped when there is one) -> record the use, announce it (AbilityTriggered) and call `activate.resolve`.
// The loop then offers the remaining abilities again until the player passes. All progress lives in phaseState.marks, so
// the whole thing is re-entrant: call runWindow again with the same arguments after every answered decision.
//
// Limits: descriptor `limit` (oncePerBattle / Round / Turn / Phase, oncePerTurnArmy; `params.army` makes any limit
// army-wide), Rule of One (CORE-3.3: one CORE ability per unit per phase; CORE-3.4: the same ability once per unit per
// phase unless it has the UNLIMITED keyword) and `fromRound`. Uses are recorded in Player.abilityUses.
import { parseDiceExpr, rollSum } from './dice'
import { codeHookFor } from './hooks-impl'
import type { DecisionHandler, EngineContext } from './modules'
import type { ActivatedAbilityHook } from './hooks'
import { applySlide, parseAt, parseSlide, readMoveQueue, readPlaceRequest, slideOptions, writeMoveQueue, writePlaceRequest } from './factions/aos-moves'
import { CFR_ID, SYNTHETIC_ABILITIES, discardReplacement, placeReplacement, replaceableUnits, replacementOptions } from './factions/spearhead-core'
import { applyRedeploy, readRedeploy, redeployOptions, writeRedeploy } from './redeploy'
import type { TimingWindowId } from '../data/types'
import type { AbilityId, DiceRoll, GameState, Phase, PlayerId, RuntimeAbility, UnitId } from './types'

// where an activated ability may be used. Phase windows use the AoS names ('hero' = Phase 'command', 'fight' = Combat).
export type AbilityWindow =
  | 'hero' | 'movement' | 'shooting' | 'charge' | 'fight'
  | 'startOfTurn' | 'endOfTurn' | 'startOfRound' | 'endOfRound' | 'deployment'

export interface UsableAbility {
  abilityId: AbilityId
  // the unit using it; null for player-wide abilities (regiment ability, battle trait)
  unitId: UnitId | null
  label: string
}

export interface AbilityService {
  // activated abilities `player` may use right now in `window` (pure)
  usable(state: GameState, player: PlayerId, window: AbilityWindow): UsableAbility[]
  // offer `player` their usable abilities for this window occurrence until they pass. Re-entrant: call again after every
  // answered decision with the same arguments; `key` distinguishes occurrences inside one phase (default: the window).
  // Returns true when a decision is now pending (the caller returns 'pending' / stops), false when the window is done.
  runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, key?: string): boolean
  // answers chooseOption topics 'abilityUse' / 'abilityTarget' / 'abilityMode' (routed by DEFAULT_MODULES.topics)
  readonly handler: DecisionHandler
}

const PHASE_OF_WINDOW: Partial<Record<AbilityWindow, Phase>> = { hero: 'command', movement: 'movement', shooting: 'shooting', charge: 'charge', fight: 'fight' }

// the TimingWindowId shown on the decisions (display only)
const DISPLAY_WINDOW: Record<AbilityWindow, TimingWindowId> = {
  hero: 'command.end', movement: 'movement.end', shooting: 'shooting.attacksResolved', charge: 'charge.moveEnded', fight: 'fight.attacksResolved',
  startOfTurn: 'turn.start', endOfTurn: 'turn.end.abilities', startOfRound: 'round.start', endOfRound: 'round.end', deployment: 'deployment.unit',
}

// ---------- candidates and gates ----------
interface Candidate { ab: RuntimeAbility; unitId: UnitId | null }

// Optional extras a faction hook may carry beyond the frozen ActivatedAbilityHook contract (hooks.ts): `targets` also receives the
// player using the ability (army abilities have no unit to read it from) and `modesFor` offers modes that depend on the game
// (Mighty Destroyers only offers A Proper Ruckus while it is unspent).
type ExtHook = ActivatedAbilityHook & {
  targets?(state: GameState, unitId: UnitId | null, player?: PlayerId): UnitId[]
  modesFor?(state: GameState, unitId: UnitId | null, player: PlayerId): { id: string; label: string }[]
}

function activateOf(ab: RuntimeAbility): ExtHook | null {
  return codeHookFor(ab.code)?.activate ?? null
}

// descriptors for abilities no data file names (Call for Reinforcements) fall back to the synthetic table
const abilityOf = (state: GameState, id: AbilityId): RuntimeAbility | undefined => state.abilities[id] ?? SYNTHETIC_ABILITIES[id]

// CORE-6.16: a player with a destroyed, not yet replaced Reinforcements unit can call it back (hook.canUse checks the room)
const hasReplaceable = (state: GameState, player: PlayerId): boolean => replaceableUnits(state, player).length > 0

function candidates(state: GameState, player: PlayerId): Candidate[] {
  const out: Candidate[] = []
  const seen = new Set<string>()
  const add = (ab: RuntimeAbility | undefined, unitId: UnitId | null): void => {
    if (!ab || ab.trigger !== 'activated') return
    const key = `${ab.id}|${unitId ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ ab, unitId })
  }
  const enhancements = (Object.values(state.abilities) as RuntimeAbility[]).filter((a) => a.source === 'enhancement' && a.bearerModelId !== null)
  for (const unit of Object.values(state.units)) {
    if (unit.player !== player || unit.location !== 'board') continue
    const ds = state.datasheets[unit.datasheetId]
    if (!ds) continue
    for (const id of ds.abilities) add(state.abilities[id], unit.id)
    for (const a of enhancements) if (unit.models.includes(a.bearerModelId as string)) add(a, unit.id)
  }
  const p = state.players[player]
  if (p.regimentAbilityId) add(state.abilities[p.regimentAbilityId], null)
  for (const id of p.battleTraitIds) add(state.abilities[id], null)
  if (hasReplaceable(state, player)) add(SYNTHETIC_ABILITIES[CFR_ID], null)
  return out
}

function timingMatches(state: GameState, ab: RuntimeAbility, player: PlayerId, window: AbilityWindow): boolean {
  const t = ab.timing
  if (!t || t.kind === 'passive' || t.kind === 'reaction') return false
  if (t.kind === 'phase') {
    if (PHASE_OF_WINDOW[window] !== t.phase) return false
  } else if (t.kind !== window) return false
  // round and deployment windows have no active player: "whose" does not restrict them
  if (t.kind === 'startOfRound' || t.kind === 'endOfRound' || t.kind === 'deployment') return true
  const own = player === state.activePlayer
  return t.whose === 'any' || (t.whose === 'your' ? own : !own)
}

function limitOk(state: GameState, player: PlayerId, ab: RuntimeAbility, unitId: UnitId | null): boolean {
  const army = ab.limit === 'oncePerTurnArmy' || ab.params?.army === true
  const uses = state.players[player].abilityUses.filter((u) => u.abilityId === ab.id && (army || u.unitId === unitId))
  const thisTurn = (u: { round: number; turn: PlayerId }): boolean => u.round === state.round && u.turn === state.activePlayer
  switch (ab.limit) {
    case 'oncePerBattle': if (uses.length > 0) return false; break
    case 'oncePerRound': if (uses.some((u) => u.round === state.round)) return false; break
    case 'oncePerTurn': case 'oncePerTurnArmy': if (uses.some(thisTurn)) return false; break
    case 'oncePerPhase': if (uses.some((u) => thisTurn(u) && u.phase === state.phase)) return false; break
    default: break
  }
  // CORE-3.4: the same ability once per phase unless the ability says otherwise
  if (!ab.keywords?.includes('UNLIMITED')) {
    const all = state.players[player].abilityUses.filter((u) => u.abilityId === ab.id && u.unitId === unitId)
    if (all.some((u) => thisTurn(u) && u.phase === state.phase)) return false
    if (unitId && state.units[unitId]?.turn.abilitiesUsedThisPhase.includes(ab.id)) return false
  }
  // CORE-3.3: a unit uses at most one CORE ability per phase
  if (unitId && ab.keywords?.includes('CORE') && state.units[unitId]?.turn.usedCoreThisPhase) return false
  return true
}

function usableFor(state: GameState, player: PlayerId, window: AbilityWindow): Candidate[] {
  const out: Candidate[] = []
  for (const c of candidates(state, player)) {
    const { ab, unitId } = c
    if (!timingMatches(state, ab, player, window)) continue
    if (ab.fromRound !== undefined && state.round < ab.fromRound) continue
    const hook = activateOf(ab)
    if (!hook) continue
    if (!limitOk(state, player, ab, unitId)) continue
    if (!hook.canUse(state, unitId, { abilityId: ab.id, unitId, player })) continue
    if (hook.targets && hook.targets(state, unitId, player).length === 0) continue
    out.push(c)
  }
  return out
}

// ---------- progress marks ----------
interface Selection { abilityId: AbilityId; unitId: UnitId | null; target?: UnitId; mode?: string }

const selPrefix = (k: string): string => `abil:sel:${k}=`
const rollPrefix = (k: string): string => `abil:roll:${k}=`
const passMark = (k: string): string => `abil:pass:${k}`
const usedPrefix = (k: string): string => `abil:used:${k}:`

function readMark<T>(state: GameState, prefix: string): T | null {
  const m = state.phaseState.marks.find((x) => x.startsWith(prefix))
  return m ? (JSON.parse(m.slice(prefix.length)) as T) : null
}
function writeMark(state: GameState, prefix: string, value: unknown): void {
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(prefix))
  state.phaseState.marks.push(prefix + JSON.stringify(value))
}
function clearMark(state: GameState, prefix: string): void {
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(prefix))
}

// move / place: the decision is the next step of an ability's movement (Mighty Destroyers) or a replacement's set-up (Call for Reinforcements)
// redeploy: where a lifted unit is set up again (redeploy.ts, FYR-RA-1 Magmic Tunnels)
interface WindowData { window: AbilityWindow; k: string; choices?: { id: string; abilityId: AbilityId; unitId: UnitId | null }[]; move?: boolean; place?: boolean; redeploy?: boolean }

function optionAction(player: PlayerId, optionId: string) {
  return { type: 'chooseOption' as const, player, decisionId: '', optionId }
}

function unitName(state: GameState, unitId: UnitId | null): string {
  return unitId ? state.units[unitId]?.name ?? unitId : 'army'
}

// ---------- battle-long bookkeeping hooks ask for (Glimmering's re-roll holder, Consecrate the Land's Ward) ----------
function ensureEffects(ctx: EngineContext): void {
  const codes = new Set<string>()
  for (const a of Object.values(ctx.state.abilities) as RuntimeAbility[]) if (a.code) codes.add(a.code)
  for (const code of codes) codeHookFor(code)?.ensureEffects?.(ctx)
}

// ---------- multi-step abilities: unit moves and replacement set-up ----------
// 'pending' = a decision was raised; 'again' = state changed, look again; 'none' = nothing left to do
function nextStep(ctx: EngineContext, window: AbilityWindow, k: string): 'pending' | 'again' | 'none' {
  const s = ctx.state
  const place = readPlaceRequest(s)
  if (place) {
    const opts = replacementOptions(s, place.unitId)
    if (opts.length === 0) { discardReplacement(s, place.unitId); writePlaceRequest(s, null); return 'again' }
    if (opts.length === 1) { placeReplacement(ctx, place.unitId, opts[0].centre); writePlaceRequest(s, null); return 'again' }
    const data: WindowData = { window, k, place: true }
    ctx.decide({
      kind: 'chooseOption', player: place.player, window: DISPLAY_WINDOW[window], canPass: false,
      context: { topic: 'abilityMode', unitId: place.unitId, abilityId: place.abilityId, data: data as unknown as Record<string, unknown> },
      options: opts.map((o) => ({ id: o.id, label: o.label, action: optionAction(place.player, o.id) })),
    })
    return 'pending'
  }
  const rd = readRedeploy(s)
  if (rd) {
    const queue = rd.unitIds.filter((id) => s.units[id]?.location === 'board')
    while (queue.length > 0) {
      const opts = redeployOptions(s, queue[0], rd.minEnemyDistance)
      if (opts.length === 0) { queue.shift(); continue } // nowhere legal: the unit stays where it is
      writeRedeploy(s, { ...rd, unitIds: queue })
      const data: WindowData = { window, k, redeploy: true }
      ctx.decide({
        kind: 'chooseOption', player: rd.player, window: DISPLAY_WINDOW[window], canPass: true,
        context: { topic: 'abilityMode', unitId: queue[0], abilityId: rd.abilityId, data: data as unknown as Record<string, unknown> },
        options: opts.map((o) => ({ id: o.id, label: `${unitName(s, queue[0])}: ${o.label}`, action: optionAction(rd.player, o.id), hint: { value: o.value } })),
      })
      return 'pending'
    }
    writeRedeploy(s, null)
    return 'again'
  }
  const mq = readMoveQueue(s)
  if (mq) {
    const queue = mq.queue.filter((id) => s.units[id]?.location === 'board')
    while (queue.length > 0) {
      const opts = slideOptions(s, queue[0], mq.maxDistance)
      if (opts.length <= 1) { queue.shift(); continue }
      writeMoveQueue(s, { ...mq, queue })
      const data: WindowData = { window, k, move: true }
      ctx.decide({
        kind: 'chooseOption', player: mq.player, window: DISPLAY_WINDOW[window], canPass: true,
        context: { topic: 'abilityMode', unitId: queue[0], abilityId: mq.abilityId, data: data as unknown as Record<string, unknown> },
        options: opts.map((o) => ({ id: o.id, label: `${unitName(s, queue[0])}: ${o.label}`, action: optionAction(mq.player, o.id) })),
      })
      return 'pending'
    }
    writeMoveQueue(s, null)
    return 'again'
  }
  return 'none'
}

// ---------- the loop ----------
function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, key?: string): boolean {
  const s = ctx.state
  const k = `${window}:${key ?? window}:${player}`
  if (s.pending) return true
  ensureEffects(ctx)
  for (let guard = 0; guard < 1000; guard++) {
    // an ability that moves units (Mighty Destroyers) or sets up a replacement (Call for Reinforcements) leaves its remaining
    // steps in the marks; they come before anything else is offered
    const stepDecision = nextStep(ctx, window, k)
    if (stepDecision === 'pending') return true
    if (stepDecision === 'again') continue
    if (s.phaseState.marks.includes(passMark(k))) return false
    const sel = readMark<Selection>(s, selPrefix(k))
    if (!sel) {
      const usable = usableFor(s, player, window)
      if (usable.length === 0) return false
      const choices = usable.map((c) => ({ id: `${c.ab.id}#${c.unitId ?? '-'}`, abilityId: c.ab.id, unitId: c.unitId }))
      const data: WindowData = { window, k, choices }
      ctx.decide({
        kind: 'chooseOption', player, window: DISPLAY_WINDOW[window], canPass: true,
        context: { topic: 'abilityUse', unitId: null, abilityId: null, data: data as unknown as Record<string, unknown> },
        options: usable.map((c, i) => ({ id: choices[i].id, label: `${c.ab.name} (${unitName(s, c.unitId)})`, action: optionAction(player, choices[i].id) })),
      })
      return true
    }
    const ab = abilityOf(s, sel.abilityId)
    const hook = ab ? activateOf(ab) : null
    if (!ab || !hook) { clearMark(s, selPrefix(k)); continue }

    // Declare: target
    if (hook.targets && sel.target === undefined) {
      const cands = hook.targets(s, sel.unitId, player)
      if (cands.length === 0) { clearMark(s, selPrefix(k)); continue }
      if (cands.length === 1) { writeMark(s, selPrefix(k), { ...sel, target: cands[0] }); continue }
      const data: WindowData = { window, k }
      ctx.decide({
        kind: 'chooseOption', player, window: DISPLAY_WINDOW[window], canPass: true,
        context: { topic: 'abilityTarget', unitId: sel.unitId, abilityId: ab.id, data: data as unknown as Record<string, unknown> },
        options: cands.map((id) => ({ id, label: unitName(s, id), action: optionAction(player, id) })),
      })
      return true
    }

    // Declare: the roll
    const n = s.phaseState.marks.filter((m) => m.startsWith(usedPrefix(k))).length
    let roll: DiceRoll | null = null
    let success = true
    if (ab.roll) {
      roll = readMark<DiceRoll>(s, rollPrefix(k))
      if (!roll) {
        const p = parseDiceExpr(ab.roll.dice)
        if (p.sides === null || p.count === 0) throw new Error(`ability ${ab.id}: declared roll '${ab.roll.dice}' is not a dice expression`)
        const modifiers = p.flat !== 0 ? [{ source: 'flat', value: p.flat }] : []
        roll = ctx.rollOnce(`abil:${k}:${n}`, { purpose: 'ability', player, sides: p.sides, count: p.count, mode: 'sum', modifiers, unitId: sel.unitId })
        if (roll === null) return true
        writeMark(s, rollPrefix(k), roll)
      }
      success = rollSum(roll) >= ab.roll.succeedOn
    }

    // Effect: the mode (only when the effect happens)
    const modes = hook.modesFor?.(s, sel.unitId, player) ?? hook.modes ?? ab.modes?.map((m) => ({ id: m.id, label: m.name })) ?? []
    let modeId: string | null = sel.mode ?? null
    if (success && modes.length > 0 && modeId === null) {
      if (modes.length === 1) modeId = modes[0].id
      else {
        const data: WindowData = { window, k }
        ctx.decide({
          kind: 'chooseOption', player, window: DISPLAY_WINDOW[window], canPass: false,
          context: { topic: 'abilityMode', unitId: sel.unitId, abilityId: ab.id, data: data as unknown as Record<string, unknown> },
          options: modes.map((m) => ({ id: m.id, label: m.label, action: optionAction(player, m.id) })),
        })
        return true
      }
    }

    // record, announce, resolve
    if (!s.abilities[ab.id]) s.abilities = { ...s.abilities, [ab.id]: ab } // synthetic descriptors join the (shared, so replaced) table
    const p = s.players[player]
    p.abilityUses.push({ abilityId: ab.id, unitId: sel.unitId, round: s.round, turn: s.activePlayer, phase: s.phase })
    if (sel.unitId && s.units[sel.unitId]) {
      const t = s.units[sel.unitId].turn
      t.abilitiesUsedThisPhase = [...t.abilitiesUsedThisPhase, ab.id]
      if (ab.keywords?.includes('CORE')) t.usedCoreThisPhase = true
    }
    clearMark(s, selPrefix(k))
    clearMark(s, rollPrefix(k))
    s.phaseState.marks.push(`${usedPrefix(k)}${n}`)
    const summary = ab.roll ? (success ? `${ab.name}: rolled ${roll ? rollSum(roll) : 0}, it works` : `${ab.name}: rolled ${roll ? rollSum(roll) : 0}, it fails`) : ab.name
    ctx.emit({ type: 'AbilityTriggered', abilityId: ab.id, sourceUnitId: sel.unitId, targetUnitId: sel.target ?? null, summary, player })
    if (success) hook.resolve(ctx, { abilityId: ab.id, unitId: sel.unitId, player, targetUnitIds: sel.target ? [sel.target] : [], modeId, roll })
    if (s.pending) return true
  }
  throw new Error('abilities.runWindow: did not settle')
}

export const abilityService: AbilityService = {
  usable(state, player, window) {
    return usableFor(state, player, window).map((c) => ({ abilityId: c.ab.id, unitId: c.unitId, label: `${c.ab.name} (${unitName(state, c.unitId)})` }))
  },
  runWindow,
  handler: {
    handle(ctx, action, pending) {
      if (pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'abilities: expected chooseOption' }
      const s = ctx.state
      const data = pending.context.data as unknown as WindowData
      const k = data.k
      const topic = pending.context.topic
      if (data.move) return answerMove(ctx, action)
      if (data.place) return answerPlace(ctx, action)
      if (data.redeploy) return answerRedeploy(ctx, action)
      if (action.type === 'pass') {
        if (topic === 'abilityUse') { s.phaseState.marks.push(passMark(k)); return }
        clearMark(s, selPrefix(k)) // cancelling a target pick drops the whole selection
        return
      }
      if (action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'abilities: expected chooseOption or pass' }
      if (topic === 'abilityUse') {
        const choice = data.choices?.find((c) => c.id === action.optionId)
        if (!choice) return { code: 'E_NOT_AN_OPTION', reason: `ability option ${action.optionId} is not offered` }
        writeMark(s, selPrefix(k), { abilityId: choice.abilityId, unitId: choice.unitId } satisfies Selection)
        return
      }
      const sel = readMark<Selection>(s, selPrefix(k))
      if (!sel) return { code: 'E_NOT_AN_OPTION', reason: 'abilities: no ability is being declared' }
      if (topic === 'abilityTarget') writeMark(s, selPrefix(k), { ...sel, target: action.optionId })
      else if (topic === 'abilityMode') writeMark(s, selPrefix(k), { ...sel, mode: action.optionId })
      else return { code: 'E_NOT_AN_OPTION', reason: `abilities: no handler for topic ${topic}` }
    },
  },
}

// ---------- answers to the multi-step decisions ----------
type Answer = Parameters<DecisionHandler['handle']>[1]
type Rejected = ReturnType<DecisionHandler['handle']>

function answerMove(ctx: EngineContext, action: Answer): Rejected {
  const s = ctx.state
  const mq = readMoveQueue(s)
  if (!mq || mq.queue.length === 0) return { code: 'E_NOT_AN_OPTION', reason: 'abilities: no move is being offered' }
  const unitId = mq.queue[0]
  if (action.type !== 'pass') {
    if (action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'abilities: expected chooseOption or pass' }
    const slide = parseSlide(action.optionId)
    if (!slide) return { code: 'E_NOT_AN_OPTION', reason: `move option ${action.optionId} is not offered` }
    if (!applySlide(ctx, unitId, slide.dx, slide.dz, mq.maxDistance)) return { code: 'E_OUT_OF_RANGE', reason: `${unitName(s, unitId)} cannot move there` }
  }
  writeMoveQueue(s, { ...mq, queue: mq.queue.slice(1) })
}

function answerRedeploy(ctx: EngineContext, action: Answer): Rejected {
  const s = ctx.state
  const rd = readRedeploy(s)
  if (!rd || rd.unitIds.length === 0) return { code: 'E_NOT_AN_OPTION', reason: 'abilities: no unit is waiting to be set up again' }
  const unitId = rd.unitIds[0]
  if (action.type !== 'pass') {
    if (action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'abilities: expected chooseOption or pass' }
    const at = parseAt(action.optionId)
    if (!at || !applyRedeploy(ctx, unitId, at, rd.minEnemyDistance, rd.markSetUp === true)) return { code: 'E_TERRITORY', reason: `${unitName(s, unitId)} cannot be set up there` }
  }
  writeRedeploy(s, { ...rd, unitIds: rd.unitIds.slice(1) })
}

function answerPlace(ctx: EngineContext, action: Answer): Rejected {
  const s = ctx.state
  const req = readPlaceRequest(s)
  if (!req) return { code: 'E_NOT_AN_OPTION', reason: 'abilities: no replacement is waiting to be set up' }
  if (action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'abilities: choose where the replacement is set up' }
  const at = parseAt(action.optionId)
  if (!at || !placeReplacement(ctx, req.unitId, at)) return { code: 'E_TERRITORY', reason: 'the replacement cannot be set up there' }
  writePlaceRequest(s, null)
}
