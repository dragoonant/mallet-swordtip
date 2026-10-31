import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, MissionData, Polygon, TerrainPieceData, Vec2 } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const idx = buildDataIndex()
const armies = Object.values(bundle.patrols).filter((p) => p.mode === 'spearhead')
const mission: MissionData = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']

describe('Spearhead armies (SPH-2)', () => {
  it('SPH-2.1 all armies ship, each with a general that is one of its units', () => {
    expect(armies.map((a) => a.id).sort()).toEqual([
      'behemat.army.stone-lobbas',
      'cities.army.castelite-company',
      'daughters.army.heartflayer-troupe',
      'fec.army.carrion-retainers',
      'fyreslayers.army.saga-axeband',
      'gloomspite.army.snarlpack-huntaz',
      'helsmiths.army.helforge-host',
      'idoneth.army.soulraid-hunt',
      'ironjawz.army.bigmob',
      'kharadron.army.skyhammer-task-force',
      'khorne.army.fangs-of-the-blood-god',
      'kruleboyz.army.swampskulka-gang',
      'lumineth.army.hurakan-vanguard',
      'nighthaunt.army.slasher-host',
      'nurgle.army.bleak-host',
      'ogors.army.warglutt-marauders',
      'ossiarch.army.mortisan-elite',
      'seraphon.army.sunblooded-prowlers',
      'skaven.army.warpspark-clawpack',
      'slaanesh.army.epicurean-revellers',
      'slaves.army.darkoath-raiders',
      'soulblight.army.bloodcrave-hunt',
      'stormcast.army.vigilant-brotherhood',
      'sylvaneth.army.spitewing-flight',
      'tzeentch.army.tzaangor-warflock',
    ])
    for (const a of armies) expect(a.units.some((u) => u.ref === a.warlord)).toBe(true)
  })

  it('SPH-2.3 every army offers exactly 2 regiment abilities, one of them the default', () => {
    for (const a of armies) {
      expect(a.regimentAbilities).toHaveLength(2)
      expect(a.regimentAbilities!.filter((r) => r.default)).toHaveLength(1)
      for (const r of a.regimentAbilities!) expect(bundle.abilities[r.id], r.id).toBeDefined()
    }
  })

  it('SPH-2.4 every army offers exactly 4 enhancements, each resolving to an ability', () => {
    for (const a of armies) {
      expect(a.enhancements).toHaveLength(4)
      expect(a.enhancements.filter((e) => e.default)).toHaveLength(1)
      for (const e of a.enhancements) {
        const enh = bundle.enhancements[e.id]
        expect(enh, e.id).toBeDefined()
        expect(typeof enh.effect === 'string' ? bundle.abilities[enh.effect] : enh.effect, e.id).toBeDefined()
      }
    }
  })

  it('SPH-13.7 every datasheet of a Spearhead army is a spearhead warscroll with Wound and Rend on its weapons', () => {
    for (const a of armies) {
      expect(checkSpearheadArmy(a, idx)).toEqual([])
      for (const u of a.units) {
        const ds = bundle.datasheets[u.datasheet]
        expect(ds.spearhead, u.datasheet).toBe(true)
        for (const c of ds.composition) for (const w of c.weapons.default) {
          expect(bundle.weapons[w].wound, w).toBeGreaterThanOrEqual(2)
          expect(bundle.weapons[w].rend, w).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('SPH-024 the validator reports a non-spearhead datasheet and a 3-enhancement army', () => {
    const army = structuredClone(armies[0])
    army.enhancements = army.enhancements.slice(0, 3)
    const errs = checkSpearheadArmy(army, idx)
    expect(errs.some((e) => e.includes('4 enhancements'))).toBe(true)
    const idx2 = structuredClone(idx)
    idx2.datasheets[armies[0].units[0].datasheet].spearhead = false
    expect(checkSpearheadArmy(armies[0], idx2).some((e) => e.includes('SPH-13.7'))).toBe(true)
  })

  it('SPH-2.1 units with reserve and profile groups are entered from the faction specs', () => {
    const bigmob = bundle.patrols['ironjawz.army.bigmob']
    expect(bigmob.units.find((u) => u.ref === 'brutes')?.reserve?.ability).toBe('ironjawz.ability.ere-we-go-arrival')
    expect(bundle.abilities['ironjawz.ability.ere-we-go-arrival'].fromRound).toBe(3)
    const profiles = ['cities.weapon.great-cannon-cannonball', 'cities.weapon.great-cannon-grapeshot'].map((id) => bundle.weapons[id].profileGroup)
    expect(profiles[0]).toBeDefined()
    expect(profiles[0]).toBe(profiles[1])
  })

  it('SPH-13.7 all shipped data files still validate against the schemas', () => {
    expect(validateAllData().filter((r) => !r.ok)).toEqual([])
  })
})

// ---- SPH-5.2 placement checker, local to the test (pure) ----
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

/** SPH-5.2 for one piece owned by `owner`; returns the broken rule names (empty = legal). */
function placementErrors(piece: TerrainPieceData, owner: 'A' | 'B', others: TerrainPieceData[], m: MissionData): string[] {
  const out: string[] = []
  const poly = world(piece)
  const terr = m.territories![owner]
  const zs = terr.map((v) => v.z)
  const lo = Math.min(...zs), hi = Math.max(...zs)
  if (poly.some((v) => v.x < -m.board.w / 2 || v.x > m.board.w / 2 || v.z < lo || v.z > hi)) out.push('notWhollyInTerritory')
  for (const o of others) if (polyToPoly(poly, world(o)) <= 6) out.push(`within6OfTerrain:${o.id}`)
  const edge = Math.min(...poly.map((v) => m.board.h / 2 - Math.abs(v.z)))
  if (edge <= 3) out.push('within3OfLongEdge')
  const divide = owner === 'A' ? hi : lo
  if (Math.min(...poly.map((v) => Math.abs(v.z - divide))) <= 3) out.push('within3OfEnemyTerritory')
  for (const ob of m.objectives) if (pointToPoly(ob, poly) < (ob.radius ?? m.objectiveMarkerRadius ?? 0)) out.push(`overlapsObjective:${ob.id}`)
  return out
}

describe('Fire and Jade standard layout (SPH-14.4)', () => {
  it('SPH-009 the mission and layout are linked and the four pieces (large + small per player) are all legal', () => {
    expect(mission.terrainLayouts).toContain(layout.id)
    expect(layout.board).toEqual(mission.board)
    expect(layout.pieces).toHaveLength(4)
    const large = layout.pieces.filter((p) => p.kind === 'ruin')
    const small = layout.pieces.filter((p) => p.kind === 'crate')
    expect([large.length, small.length]).toEqual([2, 2])
    for (const p of layout.pieces) {
      const owner = p.id.startsWith('tf-a') ? 'A' : 'B'
      expect(placementErrors(p, owner, layout.pieces.filter((o) => o !== p), mission), p.id).toEqual([])
      expect(p.traits).toContain('cover')
      expect(p.traits).toContain('unstable')
      expect(p.traits.includes('obscuring')).toBe(p.kind === 'ruin')
    }
  })

  it('SPH-009 the placement checker rejects a piece that straddles the dividing line', () => {
    const bad: TerrainPieceData = { ...layout.pieces[0], pos: { x: -5.25, z: -1.5 } }
    const errs = placementErrors(bad, 'A', layout.pieces.slice(1), mission)
    expect(errs).toContain('within3OfEnemyTerritory')
    expect(errs.some((e) => e.startsWith('overlapsObjective'))).toBe(true)
  })

  it('SPH-009 the battleplan matches the spec: 30x22 board, 4 rounds, deploy strips 6 inches from the line, 5 objectives of radius 3', () => {
    expect(mission.board).toEqual({ w: 30, h: 22 })
    expect(mission.rounds).toBe(4)
    expect(mission.objectiveRange).toBe(0)
    expect(mission.objectiveMarkerRadius).toBe(3)
    expect(mission.objectives).toHaveLength(5)
    const zs = (poly: Polygon) => [Math.min(...poly.map((v) => v.z)), Math.max(...poly.map((v) => v.z))]
    expect(zs(mission.deploymentZones.A)).toEqual([-11, -6])
    expect(zs(mission.deploymentZones.B)).toEqual([6, 11])
    expect(mission.scoring.map((s) => s.code)).toEqual(['sph.vp.holdOne', 'sph.vp.holdTwo', 'sph.vp.holdMore'])
    expect(mission.scoring.every((s) => s.when === 'turn.end' && s.who === 'active')).toBe(true)
  })
})

describe('real armies load into engine state', () => {
  it('SPH-2.1 Castelite Company vs Bigmob build a state: 17 and 19 models, general holds the enhancement, Brutes in reserve', () => {
    const setup: GameSetup = {
      mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
      players: {
        A: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
        B: { name: 'Ironjawz', faction: 'ironjawz', patrolId: 'ironjawz.army.bigmob', enhancementId: 'ironjawz.enhancement.armour-of-gork', regimentAbilityId: 'ironjawz.ability.a-proper-ruckus' },
      },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
    }
    const s = createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
    const count = (p: 'A' | 'B') => Object.values(s.units).filter((u) => u.player === p).reduce((n, u) => n + u.models.length, 0)
    expect([count('A'), count('B')]).toEqual([17, 19])
    expect(Object.values(s.units).find((u) => u.player === 'A' && u.ref === 'marshal')?.isWarlord).toBe(true)
    const brutes = Object.values(s.units).find((u) => u.player === 'B' && u.ref === 'brutes')!
    expect(brutes.reserveArrival).toBe('ironjawz.ability.ere-we-go-arrival')
    expect(s.players.B.regimentAbilityId).toBe('ironjawz.ability.a-proper-ruckus')
    expect(s.players.A.regimentAbilityId).toBe('cities.ability.for-sigmar-charge')
    expect(Object.values(s.units).filter((u) => u.isWarlord).map((u) => u.enhancementId).sort()).toEqual(['cities.enh.heirloom-blade', 'ironjawz.enhancement.armour-of-gork'])
  })
})
