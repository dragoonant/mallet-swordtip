// Base disc + selection/target rings (30-figures.md §6): rings are separate meshes parented to
// root, never baked into the figure body, and are the only client-only geometry here — the
// engine only ever sees the base's mm/shape via Model.base, never these meshes.
import { GCylinder, StdMat } from './shared'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, type Group, type MeshBasicMaterial } from 'three'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { PaintColors } from './types'
import type { ResolvedBase } from './paint'

export const BASE_THICKNESS = 0.12

/** Width of the team rim around a GLB figure's own base, in inches. It is built in world units, not scaled with the base
 *  group, so a big oval (the 120x92mm cannon) gets the same thin line as a 25mm round. */
export const RIM_WIDTH = 0.07
const RIM_GAP = 0.025

/** A flat elliptical band `gap` outside the base edge and `width` wide, both in world inches. It is built from the
 *  base's own radii rather than a scaled RingGeometry, so the line is as thin on the 120x92mm cannon oval as on a 25mm round. */
function useBandGeometry(radiusX: number, radiusZ: number, gap: number, width: number): BufferGeometry {
  const geometry = useMemo(() => {
    const SEGMENTS = 64
    const pos: number[] = []
    const idx: number[] = []
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2
      const c = Math.cos(a), sn = Math.sin(a)
      pos.push(c * (radiusX + gap), 0, sn * (radiusZ + gap), c * (radiusX + gap + width), 0, sn * (radiusZ + gap + width))
      const j = (i + 1) % SEGMENTS
      idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    return g
  }, [radiusX, radiusZ, gap, width])
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

function Band({ radiusX, radiusZ, gap, width, color, opacity = 1, y }: { radiusX: number; radiusZ: number; gap: number; width: number; color: string; opacity?: number; y: number }) {
  const geometry = useBandGeometry(radiusX, radiusZ, gap, width)
  return (
    <mesh position={[0, y, 0]} geometry={geometry}>
      <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} side={DoubleSide} />
    </mesh>
  )
}

/** The team rim of a GLB figure's own base. */
function ThinRim({ radiusX, radiusZ, color }: { radiusX: number; radiusZ: number; color: string }) {
  return <Band radiusX={radiusX} radiusZ={radiusZ} gap={RIM_GAP} width={RIM_WIDTH} color={color} y={0.004} />
}

/** Fixed world-inch line widths for the state rings (clickable amber, selected cyan, hover white): the same hairline
 *  on every base, never a share of its size. Each sits in its own lane outside the team rim so they can show together. */
export const RING_WIDTH = { highlight: 0.05, select: 0.06, hover: 0.07 } as const
export const RING_GAP = { highlight: 0.05, select: 0.12, hover: 0.21 } as const

/** Prompt-hover ring: wide, white and pulsing, so it can't be mistaken for the amber "clickable" ring
 *  or the cyan selection ring — this is the one that answers "which unit is this button?". The demand
 *  frameloop only renders on invalidate, so the pulse asks for the next frame itself. */
function HoverRing({ radiusX, radiusZ }: { radiusX: number; radiusZ: number }) {
  const group = useRef<Group>(null!)
  const material = useRef<MeshBasicMaterial>(null!)
  useFrame((state) => {
    const k = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 7)
    // Pulse by opacity and a hair of scale, never by growing the band: the line stays the same thin width.
    if (group.current) group.current.scale.setScalar(1 + 0.02 * k)
    if (material.current) material.current.opacity = 0.7 + 0.3 * k
    state.invalidate()
  })
  const geometry = useBandGeometry(radiusX, radiusZ, RING_GAP.hover, RING_WIDTH.hover)
  return (
    <group ref={group} position={[0, 0.014, 0]}>
      <mesh geometry={geometry} renderOrder={2}>
        <meshBasicMaterial ref={material} color="#ffffff" transparent opacity={0.9} side={DoubleSide} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function BaseDisc({
  radiusX,
  radiusZ,
  colors,
  selected,
  highlighted,
  hovered,
  glbBody,
  baseStyle,
}: {
  radiusX: number
  radiusZ: number
  colors: PaintColors
  selected?: boolean
  highlighted?: boolean
  hovered?: boolean
  /** A GLB figure brings its own base disc: skip ours and draw a flat team-coloured ring just outside it. */
  glbBody?: boolean
  /** Army-painter base (ground colour + rim); null/undefined = the stock look. */
  baseStyle?: ResolvedBase | null
}) {
  return (
    <>
    {glbBody && <ThinRim radiusX={radiusX} radiusZ={radiusZ} color={colors.primary} />}
    <group scale={[radiusX, 1, radiusZ]}>
      {!glbBody && (
        <>
          <mesh position={[0, BASE_THICKNESS / 2, 0]}>
            <GCylinder args={[1, 1, BASE_THICKNESS, 24]} />
            <StdMat color={baseStyle?.rim ?? colors.trim} roughness={0.7} />
          </mesh>
          <mesh position={[0, BASE_THICKNESS + 0.002, 0]}>
            <GCylinder args={[0.92, 0.92, 0.006, 24]} />
            <StdMat color={baseStyle?.color ?? colors.secondary} roughness={0.75} />
          </mesh>
        </>
      )}
    </group>
    {highlighted && <Band radiusX={radiusX} radiusZ={radiusZ} gap={RING_GAP.highlight} width={RING_WIDTH.highlight} color="#ffcc33" opacity={0.85} y={0.008} />}
    {hovered && <HoverRing radiusX={radiusX} radiusZ={radiusZ} />}
    {selected && <Band radiusX={radiusX} radiusZ={radiusZ} gap={RING_GAP.select} width={RING_WIDTH.select} color="#48e0ff" opacity={0.95} y={0.01} />}
    </>
  )
}
