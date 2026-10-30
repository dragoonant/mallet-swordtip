// The Ghyran (Realm of Life) side of Fire and Jade: data, the sim's realm switch, and a whole game on it.
// SPH-005: the defender's realm choice fixes the objective layout and the twist deck (SPH-4.3 / SPH-14.3).
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data'
import { createGame, createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, MissionData, Polygon, TerrainPieceData, Vec2 } from '../../src/data/types'
import { makeSimSetup, runGame } from '../../tools/sim-core'
import { realmForSeed, resolveRealm, spearheadMission } from '../../src/client/store/game'
import { battlefieldFor, BATTLEFIELDS, GHYRAN_BATTLEFIELD } from '../../src/client/board/terrainAssets'

const bundle: DataBundle = await loadBundle()
const aqshy: MissionData = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
const ghyran: MissionData = bundle.missions['sph-fire-and-jade-ghyran-horizontal']
const layout = bundle.terrainLayouts['sph-fire-and-jade-ghyran-standard']

// ---- SPH-5.2 placement checker, local to the test (pure; same rules as tests/data/spearhead.test.ts) ----
const world = (p: TerrainPieceData): Polygon => {
  const c = Math.cos(p.rot), s = Math.sin(p.rot)
  return p.footprint.map((v) => ({ x: p.pos.x + v.x * c - v.z * s, z: p.pos.z + v.x * s + v.z * c }))
}
const segDist = (p: Vec2, a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x, dz = b.z - a.z
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz))
}
const inside = (p: Vec2, poly: Polygon): boolean => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i].z > p.z) !== (poly[j].z > p.z) && p.x < ((poly[j].x - poly[i].x) * (p.z - poly[i].z)) / (poly[j].z - poly[i].z) + poly[i].x) c = !c
  }
  return c
}
const pointToPoly = (p: Vec2, poly: Polygon): number => (inside(p, poly) ? 0 : Math.min(...poly.map((v, i) => segDist(p, v, poly[(i + 1) % poly.length]))))
const polyToPoly = (a: Polygon, b: Polygon): number => {
  if (a.some((v) => inside(v, b)) || b.some((v) => inside(v, a))) return 0
  return Math.min(...a.map((v) => pointToPoly(v, b)), ...b.map((v) => pointToPoly(v, a)))
}
function placementErrors(piece: TerrainPieceData, owner: 'A' | 'B', others: TerrainPieceData[], m: MissionData): string[] {
  const out: string[] = []
  const poly = world(piece)
  const zs = m.territories![owner].map((v) => v.z)
  const lo = Math.min(...zs), hi = Math.max(...zs)
  if (poly.some((v) => v.x < -m.board.w / 2 || v.x > m.board.w / 2 || v.z < lo || v.z > hi)) out.push('notWhollyInTerritory')
  for (const o of others) if (polyToPoly(poly, world(o)) <= 6) out.push(`within6OfTerrain:${o.id}`)
  if (Math.min(...poly.map((v) => m.board.h / 2 - Math.abs(v.z))) <= 3) out.push('within3OfLongEdge')
  const divide = owner === 'A' ? hi : lo
  if (Math.min(...poly.map((v) => Math.abs(v.z - divide))) <= 3) out.push('within3OfEnemyTerritory')
  for (const ob of m.objectives) if (pointToPoly(ob, poly) < (ob.radius ?? m.objectiveMarkerRadius ?? 0)) out.push(`overlapsObjective:${ob.id}`)
  return out
}

describe('Ghyran battleplan data (SPH-005, SPH-14)', () => {
  it('SPH-005 the Ghyran battleplan has the Aqshy board, zones, rounds and scoring but its own five objectives', () => {
    expect(ghyran).toBeDefined()
    expect(ghyran.board).toEqual(aqshy.board)
    expect(ghyran.territories).toEqual(aqshy.territories)
    expect(ghyran.deploymentZones).toEqual(aqshy.deploymentZones)
    expect(ghyran.rounds).toBe(4)
    expect(ghyran.objectiveRange).toBe(0)
    expect(ghyran.objectiveMarkerRadius).toBe(3)
    expect(ghyran.scoring).toEqual(aqshy.scoring)
    expect(ghyran.objectives.map((o) => [o.name, o.x, o.z])).toEqual([
      ['Dracothion', 0, 0], ['Vulcatrix', -7, -7], ['Nagendra', 7, 7], ['Behemat', -14, 0], ['Ignax', 14, 0],
    ])
    // the five godbeast names are the same on both sides, so name-keyed cards behave alike; the layout is point-symmetric
    expect(ghyran.objectives.map((o) => o.name).sort()).toEqual(aqshy.objectives.map((o) => o.name).sort())
    for (const o of ghyran.objectives) expect(ghyran.objectives.some((p) => p.x === -o.x && p.z === -o.z), o.id).toBe(true)
  })

  it('SPH-009 the Ghyran standard layout is linked to the mission and all four pieces are legal around the jade objectives', () => {
    expect(ghyran.terrainLayouts).toEqual([layout.id])
    expect(layout.board).toEqual(ghyran.board)
    expect(layout.pieces).toHaveLength(4)
    for (const p of layout.pieces) {
      const owner = p.id.startsWith('tf-a') ? 'A' : 'B'
      expect(placementErrors(p, owner, layout.pieces.filter((o) => o !== p), ghyran), p.id).toEqual([])
    }
  })

  it('SPH-005 a Ghyran-named battleplan refuses the Aqshy side and the other way round', () => {
    const base: GameSetup = {
      mode: 'spearhead', missionId: ghyran.id, terrainLayoutId: layout.id,
      players: {
        A: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
        B: { name: 'Ironjawz', faction: 'ironjawz', patrolId: 'ironjawz.army.bigmob', enhancementId: 'ironjawz.enhancement.armour-of-gork' },
      },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
    }
    expect(() => createGameState({ ...base, side: 'ghyran' }, bundle, 'g', ENGINE_VERSION)).not.toThrow()
    expect(() => createGameState({ ...base, side: 'aqshy' }, bundle, 'g', ENGINE_VERSION)).toThrow(/ghyran side/)
    expect(() => createGameState({ ...base, missionId: aqshy.id, terrainLayoutId: 'sph-fire-and-jade-standard', side: 'ghyran' }, bundle, 'g', ENGINE_VERSION)).toThrow(/aqshy side/)
  })

  it('SPH-005 with no side pre-filled, the realm named by the battleplan is used without asking', () => {
    const { side: _side, ...open } = makeSimSetup(bundle, 0, DATA_VERSION, undefined, 'ghyran')
    const r = createGame({ ...open, sides: { attacker: 'A' }, firstTurn: 'A' }, 'ghyran-open', bundle)
    // no battlefield-side decision may be pending: the file fixes the realm
    expect((r.pending?.context as { topic?: string } | undefined)?.topic).not.toBe('battlefieldSide')
    expect(r.state.mission.custom.side).toBe('ghyran')
  })
})

describe('client realm choice (SPH-005)', () => {
  it('SPH-005 the realm choice picks the battleplan file; random follows the seed text and gives both realms', () => {
    expect(spearheadMission(bundle, 'aqshy')?.id).toBe(aqshy.id)
    expect(spearheadMission(bundle, 'ghyran')?.id).toBe(ghyran.id)
    expect([resolveRealm(undefined, 's'), resolveRealm('aqshy', 's'), resolveRealm('ghyran', 's')]).toEqual(['aqshy', 'aqshy', 'ghyran'])
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'seed-1', 'seed-2', 'seed-3', 'seed-4']
    const realms = seeds.map((s) => resolveRealm('random', s))
    expect(new Set(realms)).toEqual(new Set(['aqshy', 'ghyran']))
    expect(seeds.map(realmForSeed)).toEqual(realms)
  })

  it('SPH-005 the Ghyran ground mat exists and is used for the Ghyran side whatever ground the HUD cycled to', () => {
    for (const f of ['diff', 'nor', 'rough', 'emis']) expect(existsSync(`public/assets/terrain/battlefield/ghyran/${f}.jpg`), f).toBe(true)
    expect(GHYRAN_BATTLEFIELD.id).toBe('ghyran')
    for (let i = 0; i < BATTLEFIELDS.length; i++) {
      expect(battlefieldFor('ghyran', i)).toBe(GHYRAN_BATTLEFIELD)
      expect(battlefieldFor('aqshy', i)).toBe(BATTLEFIELDS[i])
    }
  })
})

describe('sim realm switch (SIM-017)', () => {
  it('SIM-017 --realm picks the battleplan; random mixes both realms and is repeatable', () => {
    for (const [realm, id] of [['aqshy', aqshy.id], ['ghyran', ghyran.id]] as const) {
      const s = makeSimSetup(bundle, 3, DATA_VERSION, undefined, realm)
      expect([s.missionId, s.side]).toEqual([id, realm])
      expect(bundle.missions[s.missionId].terrainLayouts).toContain(s.terrainLayoutId)
    }
    const pick = (g: number) => makeSimSetup(bundle, g, DATA_VERSION, undefined, 'random', 'x').side
    const sides = Array.from({ length: 16 }, (_, g) => pick(g))
    expect(new Set(sides)).toEqual(new Set(['aqshy', 'ghyran']))
    expect(Array.from({ length: 16 }, (_, g) => pick(g))).toEqual(sides)
  })

  it('SIM-017 a whole Ghyran game finishes: Ghyran objectives on the board, only Ghyran twists drawn', async () => {
    const run = await runGame(bundle, 'ghyran', 0, DATA_VERSION, false, undefined, 'ghyran')
    expect(run.violations).toEqual([])
    expect(run.final.phase).toBe('ended')
    expect(run.final.mission.custom.side).toBe('ghyran')
    expect(Object.values(run.final.objectives).map((o) => [o.pos.x, o.pos.z]).sort()).toEqual(
      ghyran.objectives.map((o) => [o.x, o.z]).sort(),
    )
    const ghyranDeck = new Set(bundle.cardDecks!['rbf.fire-and-jade'].twists.filter((t) => t.side === 'ghyran').map((t) => t.id))
    expect(run.final.twist.drawn.length).toBe(4)
    for (const id of run.final.twist.drawn) expect(ghyranDeck.has(id), id).toBe(true)
  }, 180_000)
})
