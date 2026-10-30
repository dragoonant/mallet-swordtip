// Army-specific AI hints for Slaves to Darkness (Darkoath Raiders), the army that lost the melee trade from round 1 (owner:
// src/ai). Its 1-wound, 5+ save mobs got charged or shot off the table before they could fight. Everything here is gated on the
// deciding player's faction, so no other army's play changes; utility.ts adds these terms to its own position scores.
// F11 measured (24 games a pairing, seeds 21 and 22, Slaves vs the 7 others): 74/336 wins -> 90/336. The same terms tried on
// Gloomspite Gitz, and charge focus, Flankin' Force placement, twist-aware play, Kunnin' timing, boss escort and turn-order
// choices for either army, measured flat or worse, so they are not here.
import { boardUnitsOf, modelStats, unitModels, type GameState, type ModelPlacement, type PlayerId, type UnitId } from '../engine'
import { losService } from '../engine/los'
import { objectiveByName } from '../engine/cardFlags'
import { tacticMet } from '../engine/cards'
import { unitMeleeDamage, unitRangedDamage, unitValue } from './expected'
import { controlAfter } from './objectives'

const UNDERDOGS: ReadonlySet<string> = new Set(['slaves'])

export function isUnderdog(state: GameState, player: PlayerId): boolean {
  return UNDERDOGS.has(state.players[player]?.faction ?? '')
}

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

// 2D6 >= n
function p2d6(n: number): number {
  if (n <= 2) return 1
  if (n > 12) return 0
  let c = 0
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= n) c++
  return c / 36
}

// the board with `unitId` standing at `placements` (set up there if it is not on the board yet): for the LoS / cover probes
const movedCache = new WeakMap<ModelPlacement[], GameState>()
function movedState(state: GameState, unitId: UnitId, placements: ModelPlacement[]): GameState {
  const hit = movedCache.get(placements)
  if (hit) return hit
  const models = { ...state.models }
  for (const p of placements) { const m = models[p.modelId]; if (m) models[p.modelId] = { ...m, pos: p.pos, facing: p.facing ?? m.facing } }
  const u = state.units[unitId]
  const units = u && u.location !== 'board' ? { ...state.units, [unitId]: { ...u, location: 'board' as const } } : state.units
  const out = { ...state, models, units }
  movedCache.set(placements, out)
  return out
}

function gapFromPlacements(state: GameState, placements: ModelPlacement[], targetId: UnitId): number {
  let gap = Infinity
  for (const p of placements) {
    const r = state.models[p.modelId]?.base.radius ?? 0.5
    for (const t of unitModels(state, targetId)) gap = Math.min(gap, Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) - r - t.base.radius)
  }
  return Math.max(0, gap)
}

// STD-AI-2 what ending a (non-charge) move, or a set-up (`deploy`), at `placements` leaves the unit open to in the enemy's next
// turn, in position-score units:
//  - moves only: every enemy unit whose move + 2D6 charge reaches it and wins that fight, weighted by the charge's odds and by
//    the chance this unit is not already fighting after its own charge this turn (`chargeNowP`); standing wholly on a Cover
//    feature puts the charger at -1 to hit (CORE-16.5: the unit did not charge);
//  - moves and set-ups: the shooting that can reach it, almost none from a shooter it is Obscured from (CORE-16.6) and -1 to
//    hit from one it has Cover from (probed from where the shooters stand now).
export function underdogExposure(state: GameState, player: PlayerId, unitId: UnitId, placements: ModelPlacement[], chargeNowP: number, deploy = false): number {
  if (!isUnderdog(state, player) || placements.length === 0) return 0
  let pen = 0
  const myValue = unitValue(state, unitId)
  const enemies = boardUnitsOf(state, other(player))
  if (!deploy) {
    const moved = movedState(state, unitId, placements)
    const onCover = Object.values(state.board.pieces).some((pc) => pc.traits.includes('cover') && losService.whollyOn(moved, unitId, pc.id))
    let charged = 0
    for (const e of enemies) {
      const em = unitModels(state, e.id)
      if (em.length === 0) continue
      const gap = gapFromPlacements(state, placements, e.id)
      const p = p2d6(Math.ceil(Math.max(0, gap - 0.5 - modelStats(state, em[0]).M)))
      if (p <= 0) continue
      const theirs = unitMeleeDamage(state, e.id, unitId, { charged: true, cover: onCover })
      const ours = unitMeleeDamage(state, unitId, e.id, {})
      const loss = theirs * myValue * 0.02 - ours * unitValue(state, e.id) * 0.02 * 0.5
      if (loss > 0) charged += p * loss
    }
    pen += charged * (1 - chargeNowP)
  }
  let shot = 0
  for (const e of enemies) {
    const dmg = unitRangedDamage(state, e.id, unitId, {})
    if (dmg <= 0) continue
    const em = unitModels(state, e.id)
    let range = 0
    for (const m of em) for (const w of m.weapons) { const wd = state.weapons[w]; if (wd?.kind === 'ranged') range = Math.max(range, wd.range) }
    const gap = gapFromPlacements(state, placements, e.id)
    if (gap > range + modelStats(state, em[0]).M) continue
    const moved = movedState(state, unitId, placements)
    if (losService.obscured(moved, e.id, unitId)) { shot += dmg * myValue * 0.02 * 0.15; continue }
    const cov = losService.coverPenalty(moved, e.id, unitId) > 0
    shot += (cov ? unitRangedDamage(moved, e.id, unitId, { cover: true }) : dmg) * myValue * 0.02 * (gap <= range ? 1 : 0.6)
  }
  return pen + shot * 0.5
}

// STD-AI-3 battle tactics in hand that a unit's end position can complete: Raid, Take the Flanks, Raze, Hold the Ground (cards.ts
// tacticMet on the board with this unit moved) and the dais cards (who holds the named objective, objectives.ts controlAfter).
// Counted in the player's own movement phase only, as the change in how many hand cards would be met at the end of the turn.
const POSITIONAL: ReadonlySet<string> = new Set(['card.tactic.raid', 'card.tactic.take-the-flanks', 'card.tactic.raze', 'card.tactic.hold-ground'])
const DAIS: Record<string, string> = { 'card.tactic.the-ignax-dais': 'Ignax', 'card.tactic.the-behemat-dais': 'Behemat', 'card.tactic.the-dracothion-dais': 'Dracothion' }
const CARD_W = 5
export function underdogCardChase(state: GameState, player: PlayerId, unitId: UnitId, placements: ModelPlacement[]): number {
  if (!isUnderdog(state, player) || placements.length === 0) return 0
  if (state.activePlayer !== player || state.phase !== 'movement') return 0
  const hand = state.cards?.tactics[player]?.hand ?? []
  let moved: GameState | null = null
  let ctl: Record<string, PlayerId | null> | null = null
  let now: Record<string, PlayerId | null> | null = null
  let gain = 0
  for (const card of hand) {
    if (POSITIONAL.has(card)) {
      moved ??= movedState(state, unitId, placements)
      gain += (tacticMet(moved, player, card) ? 1 : 0) - (tacticMet(state, player, card) ? 1 : 0)
    } else if (DAIS[card]) {
      const id = objectiveByName(state, DAIS[card])
      if (!id) continue
      ctl ??= controlAfter(state, { unitId, placements })
      now ??= controlAfter(state)
      gain += (ctl[id] === player ? 1 : 0) - (now[id] === player ? 1 : 0)
    }
  }
  return gain * CARD_W
}

// STD-AI-4 how much the end-of-turn objective picture weighs in this army's position scores (null = the default)
export function underdogObjectiveScale(state: GameState, player: PlayerId): number | null {
  return isUnderdog(state, player) ? 2 : null
}
