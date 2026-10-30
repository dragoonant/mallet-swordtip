// Thin, subtle rings round a unit's bases: selected, clickable (an action is waiting on it) and prompt-hovered.
// They replace the thick white/gold/cyan ellipses the figure base disc used to draw. Colour is the unit's player colour
// (enemy targets lean red so "attack this" still reads at a glance); the pulse of old is gone on purpose.
import { DoubleSide } from 'three'
import { colors } from '../ui/theme'
import { ellipseGeometry, markerYaw, type SemiAxes } from './baseMarker'

export type UnitRingKind = 'selected' | 'clickable' | 'hover'

const STYLE: Record<UnitRingKind, { outset: number; width: number; opacity: number }> = {
  selected: { outset: 0.14, width: 0.07, opacity: 0.9 },
  hover: { outset: 0.3, width: 0.06, opacity: 0.85 },
  clickable: { outset: 0.08, width: 0.035, opacity: 0.55 },
}

export function ringColor(seat: 'A' | 'B', enemyTarget: boolean): string {
  if (enemyTarget) return '#ff6a5a'
  return seat === 'A' ? colors.playerA : colors.playerB
}

/** `axes` are the base's semi-axes (rx along the facing); `facing` is the model's engine facing, so an oval base is ringed
 *  by an oval ring turned the same way. */
export function UnitRing({ kind, axes, facing, color }: { kind: UnitRingKind; axes: SemiAxes; facing: number; color: string }) {
  const s = STYLE[kind]
  const geometry = ellipseGeometry(axes.rx + s.outset, axes.rz + s.outset, s.width)
  return (
    <group position={[0, 0.045 + (kind === 'hover' ? 0.004 : kind === 'selected' ? 0.002 : 0), 0]} rotation={[0, markerYaw(facing), 0]}>
      <mesh geometry={geometry} renderOrder={3}>
        <meshBasicMaterial color={color} transparent opacity={s.opacity} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
