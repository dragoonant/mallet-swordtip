// Recolours a baked-texture GLB figure for the army painter. Each army's two dominant paint hues
// (SOURCE_HUES) are remapped in the fragment shader to the chosen major/minor, keeping every texel's
// own shading; grey/metal/dark texels (low saturation) are left alone. Materials are cloned per
// (source material, paint) and cached, so the shared loader cache is never mutated and an unpainted
// figure keeps its original materials. Also repaints the plain base cylinder finalize_model.py adds.
import { CircleGeometry, Color, Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three'
import { resolveBaseStyle, canonFaction, type ArmyPaint } from './paint'

/** The hues each faction's baked textures are mostly painted in (null = nothing to remap, e.g. black or bare metal armour). */
export const SOURCE_HUES: Record<string, { major: string | null; minor: string | null }> = {
  sm: { major: '#1b3a6b', minor: '#c9a227' },
  ork: { major: '#4b6b2f', minor: '#8b2e2e' },
  necrons: { major: null, minor: '#39ff6a' },
  'chaos-space-marines': { major: '#2b2f3a', minor: '#7a1f2b' },
  tyranids: { major: '#e3d6b4', minor: '#4b2a63' },
  'adepta-sororitas': { major: null, minor: '#a3242c' },
  'astra-militarum': { major: '#55653a', minor: '#9b7e52' },
  'grey-knights': { major: null, minor: '#2f5fb0' },
  'tau-empire': { major: '#d8cdb2', minor: '#2e6a86' },
  'adeptus-custodes': { major: '#d9a521', minor: '#a3171d' },
  'genestealer-cults': { major: '#c79a2e', minor: '#5d3a8c' },
  drukhari: { major: null, minor: '#3fae9a' },
  aeldari: { major: '#ece4cf', minor: '#4a786d' },
  'thousand-sons': { major: '#1f4fa3', minor: '#d4a73a' },
  'leagues-of-votann': { major: '#4c6067', minor: '#8a5a30' },
  'death-guard': { major: '#6f7149', minor: '#6a4f3c' },
  'world-eaters': { major: '#62252b', minor: '#7a6140' },
  'adeptus-mechanicus': { major: '#a4492f', minor: null },
  'blood-angels': { major: '#9e1b1b', minor: '#c9a227' },
  'space-wolves': { major: '#5d7896', minor: '#e0a824' },
  'chaos-daemons': { major: '#7b342d', minor: '#77603f' },
  'dark-angels': { major: '#1f3b2a', minor: '#d9cfb4' },
  // Age of Sigmar armies. Darkoath: crimson cloaks and sashes, bronze and leather trim, fur and iron (grey) left alone.
  // Fyreslayers: burnished bronze-gold armour as the major, flame-orange hair, beards and ruddy skin as the minor (they share a hue band, so a repaint moves them together).
  slaves: { major: '#642620', minor: '#9b8061' },
  fyreslayers: { major: '#c58d3b', minor: '#ac5222' },
  // The four F8 armies' hues are measured from the baked textures (linear-space HSV, mean S/V of the texels around each hue, the same
  // gate the shader uses), not guessed. Ours came out of the paint stage warmer and duller than the concept art, so the tidy "green
  // skin" / "crimson plate" of the design notes is not what is in the texture:
  // Kruleboyz: skin (it baked yellow-olive, hue 47) as the major, the red shields and rags (hue 357) as the minor; the swamp-brown
  // leather and rust iron (hue 25, 70% of the texels) sits between the two bands and is left alone.
  // Gloomspite: green goblin skin (hue 83) as the major, rust-red cloths and shields (hue 3) as the minor; wolves, black hoods and the
  // pale glow have no hue to move.
  // Lumineth: sky-blue and teal cloth, crystals and shields (hue 188) as the major, lilac ribbons and plumes (hue 312) as the minor;
  // the ivory and pale-gold armour (hue 30-45) is the neutral base.
  // Kharadron: deep-crimson trim (hue 358) as the major, brass and cream plate (hue 32, 60% of the texels) as the minor.
  kruleboyz: { major: '#948a5f', minor: '#664d4f' },
  gloomspite: { major: '#626d4d', minor: '#5e3937' },
  lumineth: { major: '#8ab0b5', minor: '#caa7c3' },
  kharadron: { major: '#6a4b4c', minor: '#988365' },
  // The four F12 armies, measured the same way from the baked textures (linear-space HSV, saturated texels only):
  // Stormcast: midnight-blue cloth and panels (hue 232) as the major, burnished gold plate (hue 31) as the minor; the white feathers and silver trim are neutral.
  // Skaven: brown fur (hue 19, 60% of the saturated texels) as the major, the pink tails, noses and rags (hue 343) as the minor; rust iron and warp-green glow are left alone.
  // Seraphon: teal scales (hue 183) as the major, gold plate (hue 38) as the minor; the Spawn's orange and the Terrawings' plum sit between the bands.
  // Soulblight: crimson lacquer (hue 357-4, dark) as the major, tarnished gold and bone trim (hue 40) as the minor; skin and leather brown (hue 26) are left alone.
  stormcast: { major: '#454a61', minor: '#997f58' },
  skaven: { major: '#7a5e4c', minor: '#b08090' },
  seraphon: { major: '#408c8f', minor: '#baa268' },
  soulblight: { major: '#613938', minor: '#978b6d' },
  // The four F14 armies, measured the same way. Khorne: crimson hide (hue 8, two thirds of the saturated texels) as the major, dark brass and bone
  // collars (hue 57) as the minor; the blackened iron is neutral. Nurgle: dirty cream, mustard and rust (hue 38, 70%) as the major, the olive-green
  // skin (hue 88) as the minor. Nighthaunt: frost-teal spectral bodies (hue 188, over half) as the major, rust-brown chains and blades (hue 22)
  // as the minor. Sylvaneth: bark-brown bodies (hue 22, half) as the major, spring-green leaf cloaks and hair (hue 98) as the minor; the teal
  // wings (hue 182) are the third band and are left alone.
  khorne: { major: '#77423e', minor: '#726c52' },
  nurgle: { major: '#887651', minor: '#898f79' },
  nighthaunt: { major: '#6a8788', minor: '#584439' },
  sylvaneth: { major: '#8f5b34', minor: '#6e8d4a' },
  // The four F16 armies, measured from the baked GLB textures the same way. Daughters of Khaine: crimson cloth (hue 2, 40% of the saturated texels) as the
  // major, bronze blades and trim (hue 32) as the minor; the blue-grey leather and the teal serpent scales (hue 192) are left alone. Idoneth: sea-blue cloth and
  // plates (hue 202, a third) as the major, tarnished bronze trim (hue 32) as the minor, the cyan bioluminescence (hue 172) is the accent and stays. Tzeentch:
  // cobalt and sky-blue skin and feathers (hue 202) as the major, gold and bronze trim (hue 27) as the minor, turquoise cloth (hue 172) left alone. Ossiarch:
  // polished bone (hue 37, nearly half) as the major, the midnight-blue lacquer plates (hue 217, dark) as the minor, the verdigris-teal soul-light (hue 177) stays.
  daughters: { major: '#8b5b58', minor: '#9e8a6c' },
  idoneth: { major: '#657f8c', minor: '#827563' },
  tzeentch: { major: '#77a6bb', minor: '#b1926f' },
  ossiarch: { major: '#a89e8a', minor: '#202d3c' },
  // Black plate has no hue to remap; the bone-coloured tabards/trim are the only repaintable colour.
  'black-templars': { major: null, minor: '#e6dfc8' },
}

function hsv(hex: string): [number, number, number] {
  const c = new Color(hex) // linear working space — the same space the shader sees after texture decode
  const mx = Math.max(c.r, c.g, c.b)
  const mn = Math.min(c.r, c.g, c.b)
  const d = mx - mn
  let h = 0
  if (d > 1e-6) {
    if (mx === c.r) h = (((c.g - c.b) / d) % 6 + 6) % 6
    else if (mx === c.g) h = (c.b - c.r) / d + 2
    else h = (c.r - c.g) / d + 4
    h /= 6
  }
  return [h, mx > 0 ? d / mx : 0, mx]
}

const GLSL_FUNCS = /* glsl */ `
uniform vec3 uSrc0; uniform vec3 uTgt0; uniform vec3 uSrc1; uniform vec3 uTgt1; uniform vec2 uOn;
vec3 pRgb2Hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)), d/(q.x+e), q.x); }
vec3 pHsv2Rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
`
const GLSL_REMAP = /* glsl */ `
#include <map_fragment>
{
  vec3 pc = pRgb2Hsv(diffuseColor.rgb);
  if (pc.y > 0.18 && pc.z > 0.02) {
    float d0 = abs(pc.x - uSrc0.x); d0 = min(d0, 1. - d0);
    float d1 = abs(pc.x - uSrc1.x); d1 = min(d1, 1. - d1);
    float w0 = uOn.x * (1. - smoothstep(0.04, 0.10, d0));
    float w1 = uOn.y * (1. - smoothstep(0.04, 0.10, d1));
    vec3 src = uSrc0; vec3 tgt = uTgt0; float w = w0;
    if (w1 > w0) { src = uSrc1; tgt = uTgt1; w = w1; }
    if (w > 0.) {
      vec3 o = vec3(fract(pc.x + (tgt.x - src.x)), clamp(pc.y * min(tgt.y / max(src.y, 0.25), 4.), 0., 1.), clamp(pc.z * min(tgt.z / max(src.z, 0.15), 4.), 0., 1.));
      diffuseColor.rgb = mix(diffuseColor.rgb, pHsv2Rgb(o), w);
    }
  }
}
`

const cache = new Map<string, Material>()

function recoloured(src: Material, faction: string, paint: ArmyPaint): Material {
  const key = `${src.uuid}|${faction}|${paint.major ?? ''}|${paint.minor ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit
  const hues = SOURCE_HUES[faction] ?? { major: null, minor: null }
  const bands = [
    [hues.major, paint.major],
    [hues.minor, paint.minor],
  ].map(([s, t]) => (s && t ? { src: hsv(s), tgt: hsv(t) } : null))
  const m = src.clone()
  const v3 = (a?: [number, number, number]) => ({ value: { x: a?.[0] ?? 0, y: a?.[1] ?? 0, z: a?.[2] ?? 0 } })
  const uniforms = {
    uSrc0: v3(bands[0]?.src),
    uTgt0: v3(bands[0]?.tgt),
    uSrc1: v3(bands[1]?.src),
    uTgt1: v3(bands[1]?.tgt),
    uOn: { value: { x: bands[0] ? 1 : 0, y: bands[1] ? 1 : 0 } },
  }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.fragmentShader = GLSL_FUNCS + shader.fragmentShader.replace('#include <map_fragment>', GLSL_REMAP)
  }
  m.customProgramCacheKey = () => 'army-paint-v1'
  cache.set(key, m)
  return m
}

const baseCache = new Map<string, Material>()
function baseMaterial(rim: string): Material {
  let m = baseCache.get(rim)
  if (!m) {
    m = new MeshStandardMaterial({ color: rim, roughness: 0.7, metalness: 0 })
    baseCache.set(rim, m)
  }
  return m
}

type Orig = { material: Material | Material[] }
const orig = (mesh: Mesh): Orig => (mesh.userData.__origMat ??= { material: mesh.material } as Orig) as Orig

/** Recolours this instance's meshes (figure + base) and returns a function that restores them. */
export function applyGlbPaint(object: Object3D, factionId: string, paint: ArmyPaint | undefined): () => void {
  const faction = canonFaction(factionId)
  const baseStyle = resolveBaseStyle(paint)
  const doFigure = !!paint && (!!paint.major || !!paint.minor)
  if (!doFigure && !baseStyle) return () => {}
  const extras: Mesh[] = []
  const touched: Mesh[] = []
  object.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const o0 = orig(mesh)
    const first = Array.isArray(o0.material) ? o0.material[0] : o0.material
    const isBase = mesh.name === 'base' || first?.name === 'base_black'
    if (isBase) {
      if (!baseStyle) return
      touched.push(mesh)
      mesh.material = baseMaterial(baseStyle.rim)
      // Ground-surface disc just above the cylinder's top face, inset so the rim stays visible.
      mesh.geometry.computeBoundingBox()
      const bb = mesh.geometry.boundingBox!
      const disc = new Mesh(new CircleGeometry(1, 40), new MeshStandardMaterial({ color: baseStyle.color, roughness: 0.9 }))
      disc.rotation.x = -Math.PI / 2
      disc.scale.set((bb.max.x - bb.min.x) / 2 - 0.045, (bb.max.z - bb.min.z) / 2 - 0.045, 1)
      disc.position.set((bb.max.x + bb.min.x) / 2, bb.max.y + 0.004, (bb.max.z + bb.min.z) / 2)
      mesh.add(disc)
      extras.push(disc)
    } else if (doFigure) {
      touched.push(mesh)
      const src = o0.material
      mesh.material = Array.isArray(src) ? src.map((m) => recoloured(m, faction, paint!)) : recoloured(src, faction, paint!)
    }
  })
  return () => {
    for (const mesh of touched) mesh.material = orig(mesh).material
    for (const d of extras) {
      d.parent?.remove(d)
      d.geometry.dispose()
      ;(d.material as Material).dispose()
    }
  }
}
