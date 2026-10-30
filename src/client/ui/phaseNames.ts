// PORT-0.3 alias table, UI side: the engine keeps its 40k internal ids (Phase 'command', MoveType 'advance', ...) and the
// client shows the Age of Sigmar names. Every label in the UI goes through here so a rename is one edit.
import type { MoveType, Phase } from '@/engine'

/** Phase ids -> display names (CORE-3): Hero phase, Combat phase. */
export const PHASE_NAME: Record<string, string> = {
  setup: 'Setup',
  deployment: 'Deployment',
  command: 'Hero',
  movement: 'Movement',
  shooting: 'Shooting',
  charge: 'Charge',
  fight: 'Combat',
  ended: 'Battle over',
}

export function phaseName(phase: Phase | string): string {
  return PHASE_NAME[phase] ?? phase.charAt(0).toUpperCase() + phase.slice(1)
}

/** "Hero phase" — the long form for sentences. */
export function phaseLong(phase: Phase | string): string {
  return phase === 'setup' || phase === 'deployment' || phase === 'ended' ? phaseName(phase) : `${phaseName(phase)} phase`
}

/** Move types: advance = Run (CORE-6.2), fallBack = Retreat (CORE-6.3). */
export const MOVE_NAME: Record<MoveType | string, string> = {
  normal: 'Normal move',
  advance: 'Run',
  fallBack: 'Retreat',
  stationary: 'Stay put',
}

export function moveName(move: MoveType | string): string {
  return MOVE_NAME[move] ?? move
}

/** Stat headings (PORT-0.3): Stats.W / Sv / OC are Health / Save / Control; Move stays Move. */
export const STAT_NAME = { M: 'Move', W: 'Health', Sv: 'Save', OC: 'Control', ward: 'Ward' } as const

/** Weapon columns: Atk / Hit / Wound / Rend / Dmg. */
export const WEAPON_COLUMNS = ['Rng', 'Atk', 'Hit', 'Wnd', 'Rend', 'Dmg'] as const
