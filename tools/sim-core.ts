// Headless simulator core: two random-legal-move bots play full Spearhead games (Cities of Sigmar vs Ironjawz on
// Fire and Jade, either realm side) through the public engine API (createGame / legalActions / step) on the real data
// bundle, checking invariants after every step. Shared by the CLI (tools/sim.ts) and tests/engine/fullgame.test.ts.
import type { DataBundle } from '../src/data/types'
import { UtilityDecider } from '../src/ai/utility'
import {
  createGame, legalActions, modelStats, step, view, EngineInvariantError,
  type Action, type GameSetup, type GameState, type PendingDecision, type PlayerId, type StepResult,
} from '../src/engine'

export interface Violation { seed: string; actionIndex: number; message: string }
export interface GameRun {
  seed: string
  setup: GameSetup
  actions: Action[]
  finalHash: string
  rounds: number
  winner: PlayerId | 'draw' | null
  reason: string | null
  vp: Record<string, number>
  factions: Record<PlayerId, string>
  violations: Violation[]
  final: GameState
}

// Fire and Jade battleplan per realm side (data: src/data/missions/). `--realm aqshy|ghyran|random` on the sim tools picks the
// side; random is a pure function of seed and game index (balance-stats / ai-trace pass no seed) so a rerun plays the same board. The default stays Aqshy.
export type SimRealm = 'aqshy' | 'ghyran' | 'random'
const MISSIONS: Record<'aqshy' | 'ghyran', string> = {
  aqshy: 'sph-fire-and-jade-aqshy-horizontal',
  ghyran: 'sph-fire-and-jade-ghyran-horizontal',
}
export function realmFromArgv(argv: string[] = process.argv): SimRealm {
  const i = argv.indexOf('--realm')
  const v = i >= 0 ? argv[i + 1] : undefined
  if (v === undefined) return 'aqshy'
  if (v === 'aqshy' || v === 'ghyran' || v === 'random') return v
  throw new Error(`sim: --realm must be aqshy, ghyran or random (got "${v}")`)
}
const BATTLE_PHASES = ['command', 'movement', 'shooting', 'charge', 'fight']
const MAX_ACTIONS = 6_000 // a normal game is a few hundred decisions; hitting this reports the game as stalled

// mulberry32: the bots' own choice RNG (the engine's dice RNG lives in state.rng)
function botRng(seedText: string): () => number {
  let h = 1779033703 ^ seedText.length
  for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  let a = h >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function playerSetup(bundle: DataBundle, patrolId: string, name: string, variant: boolean) {
  const patrol = bundle.patrols[patrolId]
  if (!patrol) throw new Error(`sim: army ${patrolId} missing from data bundle`)
  const enh = variant ? patrol.enhancements[patrol.enhancements.length - 1] : (patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0])
  const regs = patrol.regimentAbilities ?? []
  const reg = variant ? regs[regs.length - 1] : (regs.find((r) => r.default) ?? regs[0])
  return { name, faction: patrol.faction, patrolId, enhancementId: enh.id, ...(reg ? { regimentAbilityId: reg.id } : {}) }
}

// every pairing of two different Spearhead armies in the bundle (sorted ids), so a new army in data joins the sim with no edit.
// `only`: restrict to these army (patrol) or faction ids (sim --armies a,b); one id plays itself only when it is the only match.
export function simPairings(bundle: DataBundle, only?: string[]): [string, string][] {
  let patrols = Object.keys(bundle.patrols).filter((id) => (bundle.patrols[id].mode ?? 'spearhead') === 'spearhead').sort()
  if (only && only.length > 0) patrols = patrols.filter((id) => only.includes(id) || only.includes(bundle.patrols[id].faction))
  if (patrols.length === 1) return [[patrols[0], patrols[0]]]
  if (patrols.length < 2) throw new Error('sim: need two armies in the data bundle')
  const out: [string, string][] = []
  for (let i = 0; i < patrols.length; i++) for (let j = i + 1; j < patrols.length; j++) out.push([patrols[i], patrols[j]])
  return out
}

// game g: pairing floor(g / 4) (cycling), seats swapped on odd games, the last regiment / enhancement on games 2-3 of each block
// `realm` defaults to the --realm command-line flag (Aqshy when absent), so every tool that builds a sim game honours it.
export function makeSimSetup(bundle: DataBundle, gameIndex: number, dataVersion: string, only?: string[], realm: SimRealm = realmFromArgv(), baseSeed: string | number = ''): GameSetup {
  const pairs = simPairings(bundle, only)
  const [a, b] = pairs[Math.floor(gameIndex / 4) % pairs.length]
  const [p0, p1] = gameIndex % 2 === 0 ? [a, b] : [b, a]
  const variant = gameIndex % 4 >= 2
  const side: 'aqshy' | 'ghyran' = realm === 'random' ? (botRng(`realm-${baseSeed}-${gameIndex}`)() < 0.5 ? 'aqshy' : 'ghyran') : realm
  const missionId = bundle.missions[MISSIONS[side]] ? MISSIONS[side] : Object.keys(bundle.missions)[0]
  const layoutId = bundle.missions[missionId].terrainLayouts[0]
  return {
    missionId,
    terrainLayoutId: layoutId,
    players: { A: playerSetup(bundle, p0, 'Bot A', variant), B: playerSetup(bundle, p1, 'Bot B', variant) },
    sides: 'rollOff',
    firstTurn: 'rollOff',
    dataVersion,
    mode: 'spearhead',
    side,
  }
}

function checkState(s: GameState, prev: { ordinal: number; phaseIdx: number; round: number }, fail: (m: string) => void): void {
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
  for (const m of Object.values(s.models)) {
    if (!finite(m.pos.x) || !finite(m.pos.y) || !finite(m.pos.z) || !finite(m.facing)) fail(`model ${m.id} has non-finite position/facing`)
    if (!finite(m.woundsRemaining)) { fail(`model ${m.id} has non-finite wounds`); continue }
    const unit = s.units[m.unitId]
    if (!unit) { fail(`model ${m.id} belongs to missing unit ${m.unitId}`); continue }
    const W = modelStats(s, m).W
    if (m.woundsRemaining > W) fail(`model ${m.id} wounds ${m.woundsRemaining} > W ${W}`)
    if (m.woundsRemaining <= 0 && !m.pendingRemoval && !m.removalDeferred) fail(`model ${m.id} at ${m.woundsRemaining} wounds but not destroyed`)
  }
  for (const u of Object.values(s.units)) {
    if (u.location === 'destroyed' && u.models.length > 0) fail(`unit ${u.id} destroyed but still has models`)
    if (u.location !== 'destroyed' && u.models.length === 0) fail(`unit ${u.id} has no models but is ${u.location}`)
  }
  for (const p of Object.values(s.players)) {
    if (!finite(p.vp) || p.vp < 0) fail(`player ${p.id} VP ${p.vp}`)
  }
  if (s.round > 5) fail(`round ${s.round} > 5`)
  const idx = BATTLE_PHASES.indexOf(s.phase)
  const between = s.pending !== null && /^(round|turn|battle)\./.test(s.pending.window)
  if (idx >= 0 && !between) {
    const ordinal = (s.round - 1) * 2 + (s.activePlayer === s.firstPlayer ? 0 : 1)
    if (s.round < prev.round) fail(`round went backwards ${prev.round} -> ${s.round}`)
    if (ordinal < prev.ordinal) fail(`turn order went backwards (turn ordinal ${prev.ordinal} -> ${ordinal})`)
    else if (ordinal === prev.ordinal && idx < prev.phaseIdx) fail(`phase went backwards ${BATTLE_PHASES[prev.phaseIdx]} -> ${s.phase}`)
    prev.ordinal = ordinal; prev.phaseIdx = idx; prev.round = s.round
  } else if (idx < 0 && s.phase !== 'ended' && prev.ordinal >= 0) {
    fail(`returned to ${s.phase} after the battle started`)
  }
}

function choose(rand: () => number, pending: PendingDecision, legal: Action[]): Action {
  // passing out of a whole phase's unit selection is legal but makes games dull; take it only occasionally
  if (pending.kind === 'chooseUnitToActivate' && legal.length > 1 && rand() > 0.1) {
    const nonPass = legal.filter((a) => a.type !== 'pass')
    return nonPass[Math.floor(rand() * nonPass.length)]
  }
  return legal[Math.floor(rand() * legal.length)]
}

export async function runGame(bundle: DataBundle, baseSeed: string | number, gameIndex: number, dataVersion: string, ai = false, only?: string[], realm: SimRealm = realmFromArgv()): Promise<GameRun> {
  const seed = `sim-${baseSeed}-${gameIndex}`
  const setup = makeSimSetup(bundle, gameIndex, dataVersion, only, realm, baseSeed)
  const factions = { A: setup.players.A.faction, B: setup.players.B.faction } as Record<PlayerId, string>
  const rand = botRng(seed)
  const violations: Violation[] = []
  const actions: Action[] = []
  let actionIndex = -1
  const fail = (message: string) => { if (violations.length < 20) violations.push({ seed, actionIndex, message }) }
  const prev = { ordinal: -1, phaseIdx: -1, round: 0 }

  const bots = ai ? { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) } : null
  let r: StepResult
  try {
    r = createGame(setup, seed, bundle)
  } catch (err) {
    fail(`createGame threw: ${(err as Error).message}`)
    throw Object.assign(new Error(violations[0].message), { violations })
  }
  checkState(r.state, prev, fail)
  while (r.pending && actions.length < MAX_ACTIONS) {
    actionIndex = actions.length
    let legal: Action[] | null
    try {
      legal = legalActions(r.state, r.pending)
    } catch (err) {
      fail(`legalActions threw for ${r.pending.kind}: ${(err as Error).message}`)
      break
    }
    if (!legal || legal.length === 0) {
      fail(`no legal action for pending ${r.pending.kind} (window ${r.pending.window}, phase ${r.state.phase}, round ${r.state.round})`)
      break
    }
    const action = bots ? await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legal) : choose(rand, r.pending, legal)
    let next: StepResult
    try {
      next = step(r.state, action)
    } catch (err) {
      const kind = err instanceof EngineInvariantError ? 'EngineInvariantError' : 'exception'
      fail(`step threw ${kind} on ${action.type} (${r.pending.kind}, phase ${r.state.phase}, round ${r.state.round}): ${(err as Error).stack ?? (err as Error).message}`)
      break
    }
    if (next.rejection) {
      fail(`legal action ${action.type} rejected: ${next.rejection.code} ${next.rejection.reason} (${r.pending.kind}/${JSON.stringify((r.pending.context as { topic?: string })?.topic ?? '')})`)
      break
    }
    actions.push(action)
    r = next
    if (r.pending === null && r.state.phase !== 'ended') fail('no pending decision but the game has not ended')
    checkState(r.state, prev, fail)
  }
  const s = r.state
  if (violations.length === 0) {
    if (actions.length >= MAX_ACTIONS) fail(`game stalled: did not finish within ${MAX_ACTIONS} actions`)
    else if (s.phase !== 'ended' || !s.result) fail(`game stopped without a GameResult (phase ${s.phase})`)
  }
  return {
    seed, setup, actions, finalHash: s.hash, rounds: s.round,
    winner: s.result?.winner ?? null, reason: s.result?.reason ?? null,
    vp: { A: s.players.A.vp, B: s.players.B.vp }, factions, violations, final: s,
  }
}
