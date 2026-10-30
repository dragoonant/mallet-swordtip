// Board spots a decision offers as options (a redeploy's `at:<x>:<z>` choices): every candidate is a faint thin ring while
// the prompt is open, and the one whose option button is hovered (or armed on touch) lights up as a filled disc.
// Purely presentational: the prompt (src/client/ui/DecisionPrompt.tsx) fills the store, nothing here dispatches.
import { DoubleSide } from 'three'
import { useUiStore } from '../ui/uiStore'

/** Rough footprint of a unit set down around a spot, inches. */
const SPOT_RADIUS = 1.4
/** Fixed line widths, so the markers read the same at any zoom and on any unit. */
const RING_WIDTH = 0.07

export function SpotMarkers() {
  const spots = useUiStore((s) => s.candidateSpots)
  const hovered = useUiStore((s) => s.hoveredSpotId)
  if (spots.length === 0) return null
  return (
    <group>
      {spots.map((spot) => {
        const lit = spot.id === hovered
        return (
          <group key={spot.id} position={[spot.x, 0.06, spot.z]} rotation={[-Math.PI / 2, 0, 0]} data-testid={`spot-marker-${spot.id}`} renderOrder={3}>
            <mesh>
              <ringGeometry args={[SPOT_RADIUS - RING_WIDTH, SPOT_RADIUS, 40]} />
              <meshBasicMaterial color={lit ? '#ffffff' : '#ffcc33'} transparent opacity={lit ? 1 : 0.5} side={DoubleSide} depthTest={false} toneMapped={false} />
            </mesh>
            {lit && (
              <mesh>
                <circleGeometry args={[SPOT_RADIUS - RING_WIDTH, 40]} />
                <meshBasicMaterial color="#ffcc33" transparent opacity={0.35} side={DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
              </mesh>
            )}
            <mesh>
              <circleGeometry args={[lit ? 0.16 : 0.1, 16]} />
              <meshBasicMaterial color={lit ? '#ffffff' : '#ffcc33'} transparent opacity={lit ? 1 : 0.6} side={DoubleSide} depthTest={false} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
