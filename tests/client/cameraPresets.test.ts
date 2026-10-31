// Camera presets are pure maths (src/client/board/cameraPresets.ts): mirrored edge views, a viewer-side flip,
// a focus-centred follow pose, and a bounded easing curve.
import { describe, expect, it } from 'vitest'
import { cameraPose, easeInOut, maxDistanceFor, PRESET_CYCLE, TRANSITION_MS } from '../../src/client/board/cameraPresets'

const BOARD = { w: 30, h: 22 }
const DESKTOP = { aspect: 1.6, phone: false }
const PHONE = { aspect: 852 / 393, phone: true }

describe('camera presets', () => {
  it('edgeA and edgeB are mirrors in z for sideA = 1', () => {
    const a = cameraPose('edgeA', BOARD)
    const b = cameraPose('edgeB', BOARD)
    expect(a.position[2]).toBeGreaterThan(0)
    expect(b.position[2]).toBeCloseTo(-a.position[2])
    expect(b.target[2]).toBeCloseTo(-a.target[2])
    expect(b.position[1]).toBeCloseTo(a.position[1])
    expect(b.position[0]).toBeCloseTo(a.position[0])
  })

  it('sideA = -1 flips edgeA to the -z edge', () => {
    const a = cameraPose('edgeA', BOARD, undefined, -1)
    const flipped = cameraPose('edgeA', BOARD, undefined, 1)
    expect(a.position[2]).toBeLessThan(0)
    expect(a.position[2]).toBeCloseTo(-flipped.position[2])
    expect(a.target[2]).toBeCloseTo(-flipped.target[2])
  })

  it('follow centres on the focus point', () => {
    const p = cameraPose('follow', BOARD, { x: 7, z: -5 })
    expect(p.target).toEqual([7, 0, -5])
    expect(p.position[0]).toBe(7)
    expect(p.position[2]).toBeGreaterThan(-5)
  })

  it('easeInOut hits 0, 1 and the midpoint', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
  })

  it('transitions are at most 600 ms and the cycle covers all four presets', () => {
    expect(TRANSITION_MS).toBeLessThanOrEqual(600)
    expect(PRESET_CYCLE).toEqual(['top', 'edgeA', 'edgeB', 'follow'])
  })

  // Spearhead's 30x22 board has to fill the screen: the opening view sits close in, the pull-back limit stops short of a tiny table.
  it.each([['desktop', DESKTOP], ['phone', PHONE]] as const)('%s: the whole board frames at a distance that fills the screen', (_n, view) => {
    for (const id of ['edgeA', 'edgeB', 'top'] as const) {
      const p = cameraPose(id, BOARD, undefined, 1, view)
      const dist = Math.hypot(p.position[0] - p.target[0], p.position[1] - p.target[1], p.position[2] - p.target[2])
      expect(dist).toBeLessThan(52)
      expect(dist).toBeGreaterThan(20)
      expect(p.target[1]).toBe(0)
    }
    const home = cameraPose('edgeA', BOARD, undefined, 1, view)
    const homeDist = Math.hypot(home.position[1], home.position[2] - home.target[2])
    expect(maxDistanceFor(BOARD, view)).toBeGreaterThan(homeDist)
    expect(maxDistanceFor(BOARD, view)).toBeLessThan(64)
  })

  it('edgeB is the mirror of edgeA in z when fitted to a view', () => {
    const a = cameraPose('edgeA', BOARD, undefined, 1, PHONE)
    const b = cameraPose('edgeB', BOARD, undefined, 1, PHONE)
    expect(b.position[2]).toBeCloseTo(-a.position[2])
    expect(b.target[2]).toBeCloseTo(-a.target[2])
  })
})
