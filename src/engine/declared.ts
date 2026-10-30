// F8: what was just declared, for reaction windows (abilities.ts 'moveDeclared' / 'attackDeclared'). Phase marks only, no
// imports beyond types, so faction hooks can read them without import cycles.
//  - phases/movement.ts writes the declared move right after declareMove is answered (KO-BT-1 Ply the Skies, KO-RA-2 Disengage)
//  - abilities.ts runReactionWindow writes the declared attack before it offers 'attackDeclared' reactions (LRL-BT-3 Gale
//    Force); `seq` counts the attack declarations of the phase, so a hook can tell one activation from the next
import type { GameState, MoveType, UnitId } from './types'

const MOVE = 'mv:declared='
const ATTACK = 'abil:atk='

export interface DeclaredMove { unitId: UnitId; moveType: MoveType }
export interface DeclaredAttack { unitId: UnitId; phase: 'shooting' | 'fight'; seq: number }

function read<T>(state: GameState, prefix: string): T | null {
  const m = state.phaseState.marks.find((x) => x.startsWith(prefix))
  return m ? (JSON.parse(m.slice(prefix.length)) as T) : null
}
function write(state: GameState, prefix: string, value: unknown): void {
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(prefix))
  if (value !== null) state.phaseState.marks.push(prefix + JSON.stringify(value))
}

// the move the current movement-phase unit declared (Normal Move 'normal', Run 'advance', Retreat 'fallBack'); null outside
export function readDeclaredMove(state: GameState): DeclaredMove | null { return read<DeclaredMove>(state, MOVE) }
export function writeDeclaredMove(state: GameState, d: DeclaredMove | null): void { write(state, MOVE, d) }

// the latest Shoot / Fight declaration of this phase (stays until the next one; marks reset every phase)
export function readDeclaredAttack(state: GameState): DeclaredAttack | null { return read<DeclaredAttack>(state, ATTACK) }
export function writeDeclaredAttack(state: GameState, d: DeclaredAttack): void { write(state, ATTACK, d) }
