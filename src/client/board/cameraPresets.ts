// Named camera presets (pure maths — no three/react imports so it is trivially testable).
// Ported from the whirr-machine camera: four poses, each reached by an eased, interruptible tween.

export type CameraPresetId = 'top' | 'edgeA' | 'edgeB' | 'follow'

export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
}

/** What the camera has to frame the board into: the canvas aspect and whether the phone HUD (not the desktop one) is on screen. */
export interface ViewHint {
  aspect: number
  phone: boolean
  /** Canvas height in px (phone only): the bottom prompt strip has a fixed pixel height, so its share of the screen depends on it. */
  height?: number
}
const DEFAULT_VIEW: ViewHint = { aspect: 1.6, phone: false }

/** Vertical field of view of the board camera (Scene.tsx). */
const FOV_DEG = 42
const TAN_HALF_FOV = Math.tan((FOV_DEG * Math.PI) / 360)
/** Inches of table kept in frame past the board's edge, so edge units, bases and their labels are not clipped. */
const EDGE_MARGIN = 1
/** Tilt from straight down of the edge views, and of the 'top' view (which stays a hair off vertical). */
const EDGE_POLAR = (44 * Math.PI) / 180
const TOP_POLAR = (6 * Math.PI) / 180

/** The part of the screen (NDC, +-1 is an edge) the whole board must stay inside: the rest is the HUD (top bar, prompt panel,
 *  side buttons). The desktop prompt panel is shorter than the phone one but the phone board may run behind its side strip. */
interface SafeRect {
  x: number
  yMin: number
  yMax: number
}
const DESKTOP_SAFE: SafeRect = { x: 0.95, yMin: -0.68, yMax: 0.8 }
const PHONE_SAFE: SafeRect = { x: 0.86, yMin: -0.5, yMax: 0.74 }
/** Phone landscape: the bottom prompt (BottomSheet's strip layout: at most 30dvh, 6px off the edge) is a HUD zone of its own, and
 *  so is the formation strip + folded sheet stack of a placement (about 116px). The board's near edge, which is where the
 *  player's own deployment zone is, has to stay above whichever is taller. */
const PHONE_BOTTOM_HUD_PX = 128
function safeFor(view: ViewHint): SafeRect {
  if (!view.phone) return DESKTOP_SAFE
  if (!view.height || view.height < 200) return PHONE_SAFE
  return { ...PHONE_SAFE, yMin: Math.max(PHONE_SAFE.yMin, -1 + (2 * PHONE_BOTTOM_HUD_PX) / view.height) }
}

/**
 * Camera for the whole board in frame: for a view from `side` (+1 = from the +z edge, -1 = from -z) tilted `polar` off the
 * vertical, the nearest-in distance and the ground target (slid along z) at which every corner of the board, plus a margin,
 * lands inside the HUD-free part of the screen. Pure maths, memoised: the pose changes only with the aspect and the HUD.
 */
const fitCache = new Map<string, CameraPose>()
function fitBoard(board: { w: number; h: number }, side: 1 | -1, polar: number, view: ViewHint): CameraPose {
  const key = `${board.w}x${board.h}|${side}|${polar.toFixed(3)}|${view.aspect.toFixed(3)}|${view.phone ? 'p' : 'd'}|${view.phone ? Math.round(view.height ?? 0) : 0}`
  const hit = fitCache.get(key)
  if (hit) return hit
  const safe = safeFor(view)
  const aspect = Math.max(0.5, view.aspect)
  const hw = board.w / 2 + EDGE_MARGIN
  const hh = board.h / 2 + EDGE_MARGIN
  const sin = Math.sin(polar), cos = Math.cos(polar)
  // lens direction from the target: up and toward the viewer's edge
  const fits = (d: number, tz: number): boolean => {
    const py = d * cos, pz = tz + d * sin * side
    // forward = toward the target; camera up = world up, tilted to be perpendicular to forward
    const fy = -cos, fz = -sin * side
    const uy = sin, uz = -cos * side // unit, perpendicular to (fy, fz), with a positive y part
    for (const cx of [-hw, hw]) {
      for (const cz of [-hh, hh]) {
        const vx = cx, vy = -py, vz = cz - pz
        const depth = vy * fy + vz * fz
        if (depth <= 0.5) return false
        const nx = vx / (depth * TAN_HALF_FOV * aspect)
        const ny = (vy * uy + vz * uz) / (depth * TAN_HALF_FOV)
        if (Math.abs(nx) > safe.x || ny < safe.yMin || ny > safe.yMax) return false
      }
    }
    return true
  }
  let best: { d: number; tz: number } | null = null
  for (let tz = -10; tz <= 10; tz += 0.5) {
    let lo = 8, hi = 300
    if (!fits(hi, tz)) continue
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid, tz)) hi = mid
      else lo = mid
    }
    if (!best || hi < best.d - 1e-3 || (Math.abs(hi - best.d) <= 1e-3 && Math.abs(tz) < Math.abs(best.tz))) best = { d: hi, tz }
  }
  const { d, tz } = best ?? { d: Math.max(board.w, board.h) * 1.6, tz: 0 }
  const pose: CameraPose = { position: [0, d * cos, tz + d * sin * side], target: [0, 0, tz] }
  fitCache.set(key, pose)
  return pose
}

/** World units are inches, y up. `board.h` is the z-depth. `sideA` is +1 when the viewer's home edge is +z,
 *  -1 when it is -z: the edge presets look from behind that side so the viewer's army is in the foreground.
 *  `view` (canvas aspect, phone HUD or not) lets the whole board fill the screen whatever the window shape. */
export function cameraPose(
  preset: CameraPresetId,
  board: { w: number; h: number },
  focus?: { x: number; z: number },
  sideA = 1,
  view: ViewHint = DEFAULT_VIEW,
): CameraPose {
  const span = Math.max(board.w, board.h)
  const side: 1 | -1 = sideA < 0 ? -1 : 1
  switch (preset) {
    case 'top':
      return fitBoard(board, side, TOP_POLAR, view)
    case 'edgeA':
      return fitBoard(board, side, EDGE_POLAR, view)
    case 'edgeB':
      return fitBoard(board, side === 1 ? -1 : 1, EDGE_POLAR, view)
    default: {
      const f = focus ?? { x: 0, z: 0 }
      // from the viewer's own edge, like the edge views: a viewer on the -z side must not be swung round to the far side
      return { position: [f.x, span * 0.5, f.z + side * span * 0.45], target: [f.x, 0, f.z] }
    }
  }
}

export const CAMERA_TRANSITION_MS = 450
/** Tween length: every camera transition stays at or under 600 ms. */
export const TRANSITION_MS = Math.min(600, CAMERA_TRANSITION_MS)

export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

export const PRESET_CYCLE: CameraPresetId[] = ['top', 'edgeA', 'edgeB', 'follow']

/** Furthest the camera may dolly from the orbit target: a little beyond the straight-down view that frames the whole board,
 *  so the player can pull back for a look but never to a postage-stamp table. */
export const maxDistanceFor = (board: { w: number; h: number }, view: ViewHint = DEFAULT_VIEW): number => {
  const top = fitBoard(board, 1, TOP_POLAR, view)
  return Math.hypot(top.position[1], top.position[2] - top.target[2]) * 1.2
}

/** Nearest the camera may dolly to the orbit target. */
export const MIN_CAMERA_DISTANCE = 8
