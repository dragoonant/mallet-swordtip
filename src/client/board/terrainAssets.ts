// CC0 PBR textures and low-poly models from Poly Haven, used to texture the battle mat and
// terrain meshes. Purely presentational — see public/assets/terrain/CREDITS.md for asset credits.
// Loaded via drei's useTexture/useGLTF, which suspend: callers must render inside
// <Suspense fallback={null}> so the scene never blanks while an asset streams in.
import * as THREE from 'three'
import { useGLTF, useTexture } from '@react-three/drei'

const BASE = import.meta.env.BASE_URL + 'assets/terrain/'

export interface PbrUrls {
  map: string
  normalMap: string
  roughnessMap: string
  /** Glowing parts of the mat (the lava seams of the Realm of Fire mats); absent on plain PBR sets. */
  emissiveMap?: string
}

export interface Battlefield {
  id: string
  name: string
  urls: PbrUrls
}

const battlefield = (id: string, name: string): Battlefield => ({
  id,
  name,
  urls: {
    map: BASE + `battlefield/${id}/diff.jpg`,
    normalMap: BASE + `battlefield/${id}/nor.jpg`,
    roughnessMap: BASE + `battlefield/${id}/rough.jpg`,
    emissiveMap: BASE + `battlefield/${id}/emis.jpg`,
  },
})

/** Non-tiling 30:22 ground mats, each stretched once across the whole board. Baked by art/board-textures/gen_aqshy.py:
 *  the Realm of Fire (scorched earth, ash drifts, glowing lava seams). The 40k grim-industrial mats were retired
 *  from the picker; their files stay in public/assets/terrain/battlefield/ for the 42k fork. */
export const BATTLEFIELDS: readonly Battlefield[] = [
  battlefield('aqshy', 'Aqshy Scorchlands'),
  battlefield('basalt', 'Basalt Flats'),
  battlefield('ashlands', 'Ember Ashlands'),
]

/** The Realm of Life side of Fire and Jade: the Aqshy mat re-coloured to moss, grass and jade-veined ground by
 *  art/board-textures/tint_ghyran.py (no new art). It is the one ground used whenever a game is on the Ghyran side; the
 *  HUD's ground cycle only moves between the Realm of Fire mats above. */
export const GHYRAN_BATTLEFIELD: Battlefield = battlefield('ghyran', 'Ghyran Jade Grove')

/** The ground mat for a realm side: Ghyran's own, or the chosen Realm of Fire mat. */
export const battlefieldFor = (realm: 'aqshy' | 'ghyran', index: number): Battlefield => (realm === 'ghyran' ? GHYRAN_BATTLEFIELD : BATTLEFIELDS[index])

export const BRICK_URLS: PbrUrls = {
  map: BASE + 'brick/diff_1k.jpg',
  normalMap: BASE + 'brick/nor_gl_1k.jpg',
  roughnessMap: BASE + 'brick/rough_1k.jpg',
}

export const CONCRETE_URLS: PbrUrls = {
  map: BASE + 'concrete/diff_1k.jpg',
  normalMap: BASE + 'concrete/nor_gl_1k.jpg',
  roughnessMap: BASE + 'concrete/rough_1k.jpg',
}

export const METAL_URLS: PbrUrls = {
  map: BASE + 'metal/diff_1k.jpg',
  normalMap: BASE + 'metal/nor_gl_1k.jpg',
  roughnessMap: BASE + 'metal/rough_1k.jpg',
}

export const BARRIER_MODEL_URL = BASE + 'barrier/concrete_road_barrier_02_1k.gltf'
export const ROCK_MODEL_URLS = [
  BASE + 'rocks/moon_rock_02/moon_rock_02_1k.gltf',
  BASE + 'rocks/moon_rock_03/moon_rock_03_1k.gltf',
]

useGLTF.preload(BARRIER_MODEL_URL)
for (const url of ROCK_MODEL_URLS) useGLTF.preload(url)

export interface PbrTextures {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
  emissiveMap?: THREE.Texture
}

/** Loads a {map,normalMap,roughnessMap} set, tags the diffuse map sRGB, and enables repeat
 *  wrapping on all three. The returned textures are drei-cached by URL (shared across callers) —
 *  clone them (see `cloneRepeat`) before setting an instance-specific `.repeat`. */
export function useTiledPBR(urls: PbrUrls): PbrTextures {
  const [map, normalMap, roughnessMap] = useTexture([urls.map, urls.normalMap, urls.roughnessMap])
  map.colorSpace = THREE.SRGBColorSpace // albedo is sRGB; normal + roughness stay linear (NoColorSpace)
  normalMap.colorSpace = roughnessMap.colorSpace = THREE.NoColorSpace
  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
  }
  return { map, normalMap, roughnessMap }
}

/** Clones a tiled PBR texture set so `.repeat` can be set per mesh instance without fighting
 *  other users of the same cached texture. */
export function cloneRepeat(textures: PbrTextures, repeatX: number, repeatY: number): PbrTextures {
  const clone = (t: THREE.Texture) => {
    const c = t.clone()
    c.needsUpdate = true
    c.repeat.set(Math.max(repeatX, 0.01), Math.max(repeatY, 0.01))
    return c
  }
  return { map: clone(textures.map), normalMap: clone(textures.normalMap), roughnessMap: clone(textures.roughnessMap) }
}

/** Bounding-box width (x) and depth (z) of a board-space polygon, for scaling texture repeat. */
export function polygonFootprintSize(polygon: { x: number; z: number }[]): { width: number; depth: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  return { width: Math.max(maxX - minX, 0.01), depth: Math.max(maxZ - minZ, 0.01) }
}

/** Loads one battlefield's texture set for stretching once over the board: repeat 1, clamped edges,
 *  sRGB diffuse. (Separate from useTiledPBR, which sets RepeatWrapping on the shared cached textures.) */
export function useBattlefieldPBR(urls: PbrUrls, anisotropy?: number): PbrTextures {
  const list = urls.emissiveMap ? [urls.map, urls.normalMap, urls.roughnessMap, urls.emissiveMap] : [urls.map, urls.normalMap, urls.roughnessMap]
  const [map, normalMap, roughnessMap, emissiveMap] = useTexture(list)
  map.colorSpace = SRGB
  if (emissiveMap) emissiveMap.colorSpace = SRGB // emissive colour is authored in sRGB like the albedo
  normalMap.colorSpace = roughnessMap.colorSpace = THREE.NoColorSpace
  for (const t of emissiveMap ? [map, normalMap, roughnessMap, emissiveMap] : [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    t.repeat.set(1, 1)
    if (anisotropy) t.anisotropy = anisotropy
    t.needsUpdate = true
  }
  return { map, normalMap, roughnessMap, emissiveMap }
}
const SRGB = THREE.SRGBColorSpace
