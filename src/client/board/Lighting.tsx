import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { usePresentationSettings } from '../presentation/settings'
import { useBoardSize } from './Board'
import { useRealmSide, type Realm } from './realm'

/** Sun direction (unit vector from the board towards the sun, y up) and colour — exported so other
 *  code (ambience flashes, decals, UI) can stay consistent with the key light. Elevation is ~32 degrees:
 *  low enough to rake across figures and terrain so forms show a light-to-shade gradient. */
export const SUN_DIRECTION: readonly [number, number, number] = [0.736, 0.534, 0.416]
export const SUN_COLOR = '#ffcf98'
const SUN_DISTANCE = 60
const SUN_POSITION: [number, number, number] = [SUN_DIRECTION[0] * SUN_DISTANCE, SUN_DIRECTION[1] * SUN_DISTANCE, SUN_DIRECTION[2] * SUN_DISTANCE]

/** Sky, bounce and fill colours per realm side. Aqshy is the ember-lit scene described below; Ghyran is a green-gold
 *  afternoon: a leaf-green dusk sky, a pale-lime sky bounce over mossy ground, and a cool jade fill. The sun key keeps
 *  its direction (and SUN_COLOR, which the ambience flashes read) so shadows fall the same way on both sides. */
const REALM_LIGHT: Record<Realm, { sky: string; hemiSky: string; hemiGround: string; ambient: string; fill: string; sun: string }> = {
  aqshy: { sky: '#1c0d08', hemiSky: '#ffc9a0', hemiGround: '#8a3a1c', ambient: '#ffb48a', fill: '#ff9a6a', sun: SUN_COLOR },
  ghyran: { sky: '#0b1d12', hemiSky: '#d8f2b8', hemiGround: '#2f6a34', ambient: '#a6e0a0', fill: '#6cc8a0', sun: '#fff0c4' },
}

/** Ember-lit scene (Aqshy): a warm shadowed directional key, a peach sky / glowing-ground bounce hemisphere carrying
 *  most of the ambient, and a weak copper shadowless fill from the opposite side so faces turned away from the sun
 *  stay readable (darker and redder than the lit side, never black). The shadow frustum is an orthographic box
 *  looking down the sun direction: +-30" across covers the 44x30 board's half-diagonal (26.6") plus the
 *  sideways shift of tall terrain, +-24" vertically covers the board's foreshortened depth (~14") plus terrain
 *  height, and far=130 reaches past the board from the 60" stand-off. The shadow map is only re-rendered on
 *  demand (see ShadowSync) rather than every frame. */
export function Lighting() {
  const lowGraphics = usePresentationSettings((s) => s.lowGraphics)
  const { w, h } = useBoardSize()
  const c = REALM_LIGHT[useRealmSide()]
  // shadow frustum follows the board's half-diagonal plus a margin for tall terrain: about +-22 x +-18 for 30x22
  const sx = Math.hypot(w, h) / 2 + 3.4
  const sy = sx * 0.8
  return (
    <>
      {/* Realm of Fire: a smouldering dusk sky behind the board, warm sky/ember-bounce ambient, a coppery fill.
          Realm of Life: the same rig in greens (REALM_LIGHT). */}
      <color attach="background" args={[c.sky]} />
      <hemisphereLight intensity={1.05} color={c.hemiSky} groundColor={c.hemiGround} />
      <ambientLight intensity={0.18} color={c.ambient} />
      <directionalLight position={[-24, 14, -16]} intensity={0.55} color={c.fill} />
      <directionalLight
        position={SUN_POSITION}
        intensity={2.6}
        color={c.sun}
        castShadow={!lowGraphics}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={130}
        shadow-camera-left={-sx}
        shadow-camera-right={sx}
        shadow-camera-top={sy}
        shadow-camera-bottom={-sy}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
    </>
  )
}

/** Makes the shadow map update on demand: figures flag it stale while animating (figures/anim.ts
 *  requestFrame); this flags it whenever `deps` change (unit positions, terrain) and a few times
 *  shortly after mount so late-loading terrain models get into the map. */
export function ShadowSync({ deps }: { deps: readonly unknown[] }) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    const timers = [400, 1200, 3000].map((ms) =>
      setTimeout(() => {
        gl.shadowMap.needsUpdate = true
        invalidate()
      }, ms),
    )
    return () => timers.forEach(clearTimeout)
  }, [gl, invalidate])
  useEffect(() => {
    gl.shadowMap.needsUpdate = true
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return null
}
