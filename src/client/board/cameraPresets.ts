// Named camera presets (pure maths — no three/react imports so it is trivially testable).
// Ported from the whirr-machine camera: four poses, each reached by an eased, interruptible tween.

export type CameraPresetId = 'top' | 'edgeA' | 'edgeB' | 'follow'

export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
}

/** World units are inches, y up. `board.h` is the z-depth. `sideA` is +1 when the viewer's home edge is +z,
 *  -1 when it is -z: the edge presets look from behind that side so the viewer's army is in the foreground. */
/** The Spearhead board (30x22) is smaller than the 40k one these poses were tuned for: pull the edge views in so it fills the screen. */
const EDGE_ZOOM = 0.88
/** `down` slides the whole view toward the viewer's edge so the far edge of the board clears the HUD strip. */
function tighten(p: CameraPose, down: number): CameraPose {
  const [px, py, pz] = p.position, [tx, ty, tz] = p.target
  return { position: [tx + (px - tx) * EDGE_ZOOM, ty + (py - ty) * EDGE_ZOOM, tz + (pz - tz) * EDGE_ZOOM + down], target: [tx, ty, tz + down] }
}

export function cameraPose(
  preset: CameraPresetId,
  board: { w: number; h: number },
  focus?: { x: number; z: number },
  sideA = 1,
): CameraPose {
  const span = Math.max(board.w, board.h)
  switch (preset) {
    case 'top':
      return { position: [0, span * 1.45, span * 0.12 * sideA], target: [0, 0, 0] }
    case 'edgeA':
      return tighten({ position: [0, span * 1.4, span * 0.88 * sideA], target: [0, 0, span * 0.16 * sideA] }, -span * 0.05 * sideA)
    case 'edgeB':
      return tighten({ position: [0, span * 1.4, -span * 0.88 * sideA], target: [0, 0, -span * 0.16 * sideA] }, span * 0.05 * sideA)
    default: {
      const f = focus ?? { x: 0, z: 0 }
      return { position: [f.x, span * 0.5, f.z + span * 0.45], target: [f.x, 0, f.z] }
    }
  }
}

export const CAMERA_TRANSITION_MS = 450
/** Tween length: every camera transition stays at or under 600 ms. */
export const TRANSITION_MS = Math.min(600, CAMERA_TRANSITION_MS)

export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

export const PRESET_CYCLE: CameraPresetId[] = ['top', 'edgeA', 'edgeB', 'follow']

/** Furthest the camera may dolly from the orbit target. */
export const maxDistanceFor = (board: { w: number; h: number }): number => Math.max(board.w, board.h) * 2.4

/** Nearest the camera may dolly to the orbit target. */
export const MIN_CAMERA_DISTANCE = 8
