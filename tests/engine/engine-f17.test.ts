// F17 engine fixes for the bugs the F16 QA pass found. Test names carry ENG-F17-<n>.
// ENG-F17-1: returning slain models (CORE-6.14) looks for spots around every placed model of the unit, the ones returned earlier
// in the same call included, while still demanding coherency with the models that were there before.
// ENG-F17-2: a model whose base overlaps the observer's (or the observed model's) base never blocks visibility between them, so
// a friendly unit stood on top of the Isharann Soulscryer no longer hides every unit from Ritual of the Creeping Mist.
import { describe, expect, it } from 'vitest'
import { DEFAULT_MODULES, ScriptedRng, createContext, removeModel, unitModels, type GameEvent, type GameState, type Model, type UnitId } from '../../src/engine'
import { basesOverlap, distance, ENGAGEMENT_H, inCoherencyRange, whollyOnBoard } from '../../src/engine/geometry'
import { returnSlainModels } from '../../src/engine/factions/aos-common'
import { losService } from '../../src/engine/los'
import { codeHooks } from '../../src/engine/code-hooks'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/idoneth/abilities.json'
import enhancementsJson from '../../src/data/factions/idoneth/enhancements.json'
import weaponsJson from '../../src/data/factions/idoneth/weapons.json'
import factionJson from '../../src/data/factions/idoneth/faction.json'
import patrolJson from '../../src/data/factions/idoneth/patrols/soulraid-hunt.json'
import scryerJson from '../../src/data/factions/idoneth/datasheets/isharann-soulscryer.json'
import morrsarrJson from '../../src/data/factions/idoneth/datasheets/akhelian-morrsarr-guard.json'
import allopexJson from '../../src/data/factions/idoneth/datasheets/akhelian-allopex.json'
import thrallsJson from '../../src/data/factions/idoneth/datasheets/namarti-thralls.json'

// ---------- helpers ----------
function offBoard(s: GameState): void {
  for (const u of Object.values(s.units)) u.location = 'reserves'
}
function at(s: GameState, unitId: UnitId, keep: number, pos: [number, number, number][]): Model[] {
  for (const id of [...s.units[unitId].models].slice(keep)) removeModel(s, id)
  s.units[unitId].location = 'board'
  const ms = unitModels(s, unitId)
  ms.forEach((m, i) => { const [x, z, f] = pos[i]; m.pos = { x, y: 0, z }; m.facing = f })
  return ms
}
function row(s: GameState, unitId: UnitId, cx: number, cz: number, gap = 0.15): void {
  const ms = unitModels(s, unitId)
  const r = Math.max(...ms.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
  const step = 2 * r + gap
  s.units[unitId].location = 'board'
  ms.forEach((m, i) => { m.pos = { x: cx + (i - (ms.length - 1) / 2) * step, y: 0, z: cz } })
}

// ---------- ENG-F17-1 returning slain models ----------
describe('ENG-F17-1 returning slain models anchors on every placed model', () => {
  // one Guard left at the centre, hemmed in by three friendly models of other units; nine Guards slain
  const hemmed = (): { s: GameState; original: Model } => {
    const s = aosState()
    offBoard(s)
    const [original] = at(s, 'A:guard', 1, [[0, 0, 0]])
    at(s, 'A:boss', 1, [[-0.05888137597941383, 1.5845216787687975, 3.0798254580808395]])
    at(s, 'A:knight', 1, [[-2.7779814752456375, -1.0147797054679597, 0.28513190627830126]])
    at(s, 'A:cannon', 1, [[-3.384551585402682, 2.194730003728087, 2.9568108930588712]])
    return { s, original }
  }

  it('ENG-F17-1 a hemmed-in unit gets back every model that fits, each in coherency with a model that was already there', () => {
    const { s, original } = hemmed()
    expect(s.units['A:guard'].destroyedModels.length).toBe(9)
    const { ctx, events } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    // before the fix the search only looked around the lone original Guard and found two spots
    expect(returnSlainModels(ctx, 'A:guard', 3, 'test')).toBe(3)
    expect(events.filter((e: GameEvent) => e.type === 'ModelReturned').length).toBe(3)
    const back = unitModels(s, 'A:guard').filter((m) => m.id !== original.id)
    expect(back.length).toBe(3)
    const board = Object.values(s.models).filter((m) => s.units[m.unitId].location === 'board')
    for (const m of back) {
      expect(inCoherencyRange(m, original, 0.5)).toBe(true) // never chained off another returned model
      expect(whollyOnBoard(m, s.board)).toBe(true)
      expect(board.some((o) => o.id !== m.id && basesOverlap(m, o))).toBe(false)
      expect(m.woundsRemaining).toBe(1)
    }
  })

  it('ENG-F17-1 returned models still keep out of enemy combat range, and none come back when no spot is legal', () => {
    const { s } = hemmed()
    // an enemy Brute 3.5" south of the Guard: no returned model may end within 3" of it
    at(s, 'B:brute', 1, [[0, -4.6, 0]])
    const brute = unitModels(s, 'B:brute')[0]
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    const got = returnSlainModels(ctx, 'A:guard', 3, 'test')
    const back = unitModels(s, 'A:guard').slice(1)
    expect(back.length).toBe(got)
    for (const m of back) expect(distance(m, brute)).toBeGreaterThan(ENGAGEMENT_H)
    // the lone Guard pressed into a board corner with the Cannon filling the only open side: nothing fits
    const t = aosState()
    offBoard(t)
    at(t, 'A:guard', 1, [[14.36, 10.36, 0]])
    at(t, 'A:cannon', 1, [[12.2, 9.5, 0]])
    const c2 = createContext(t, new ScriptedRng([]), DEFAULT_MODULES)
    const n = returnSlainModels(c2.ctx, 'A:guard', 3, 'test')
    for (const m of unitModels(t, 'A:guard')) expect(whollyOnBoard(m, t.board)).toBe(true)
    expect(n).toBeLessThan(3)
  })
})

// ---------- ENG-F17-2 visibility through overlapping models ----------
const idonethBundle = (): DataBundle => withAosBundle((b) => {
  for (const a of structuredClone(abilitiesJson) as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of structuredClone(weaponsJson) as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of structuredClone([scryerJson, morrsarrJson, allopexJson, thrallsJson].flat()) as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of structuredClone(enhancementsJson) as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.idoneth = structuredClone(factionJson) as unknown as FactionData
  b.patrols[patrolJson.id] = structuredClone(patrolJson) as unknown as DataBundle['patrols'][string]
})
const SCRYER = 'A:isharann-soulscryer'
const GUARD = 'A:akhelian-morrsarr-guard'
const TH1 = 'A:thralls-1'
const mistTargets = (s: GameState): UnitId[] =>
  (codeHooks.idonethCreepingMist.activate!.targets as unknown as (state: GameState, unitId: UnitId | null) => UnitId[])(s, SCRYER)

describe('ENG-F17-2 overlapping models do not block visibility', () => {
  const idoneth = (): GameState => {
    const s = aosState({ players: {
      A: makeAosPlayer('A', { faction: 'idoneth', patrolId: 'idoneth.army.soulraid-hunt', enhancementId: 'idoneth.enh.steelshell-armour', regimentAbilityId: 'idoneth.ability.way-of-the-cresting-wave' }),
      B: makeAosPlayer('B'),
    } }, idonethBundle())
    offBoard(s)
    row(s, SCRYER, 0, -6)
    row(s, TH1, 0, 0)
    return s
  }

  it('ENG-F17-2 Creeping Mist: a friendly unit stood on top of the caster no longer hides the other friendly units', () => {
    const s = idoneth()
    // the Morrsarr Guard row sits right over the Soulscryer: every line from the caster used to start inside a Guard model
    row(s, GUARD, 0, -6, 0)
    const scryer = unitModels(s, SCRYER)[0]
    expect(unitModels(s, GUARD).some((m) => basesOverlap(m, scryer))).toBe(true)
    expect(losService.unitVisible(s, scryer.id, TH1)).toBe(true)
    expect(mistTargets(s)).toEqual(expect.arrayContaining([SCRYER, GUARD, TH1]))
    // the overlapping unit itself is seen too (a model on top of the observer is plainly visible)
    expect(losService.unitVisible(s, scryer.id, GUARD)).toBe(true)
  })

  it('ENG-F17-2 a model clear of both ends still blocks; a model is always visible to itself', () => {
    const s = idoneth()
    const scryer = unitModels(s, SCRYER)[0]
    // an enemy Brute made 6" tall, halfway between the caster and a lone Thrall: it hides the Thrall (CORE-7.1)
    for (const id of [...s.units[TH1].models].slice(1)) removeModel(s, id)
    unitModels(s, TH1)[0].pos = { x: 0, y: 0, z: 0 }
    const [brute] = at(s, 'B:brute', 1, [[0, -3, 0]])
    brute.height = 6
    expect(losService.unitVisible(s, scryer.id, TH1)).toBe(false)
    expect(mistTargets(s)).not.toContain(TH1)
    expect(losService.visible(s, scryer.id, scryer.id)).toBe(true)
  })

  it('ENG-F17-2 combat visibility: an enemy model overlapping a fighter does not hide the enemy unit it is in combat with', () => {
    const s = aosState()
    offBoard(s)
    const [g] = at(s, 'A:guard', 1, [[0, 0, 0]])
    at(s, 'B:boss', 1, [[0, 2, 0]])
    // a Brute stacked on top of the Guard (bases overlap)
    at(s, 'B:brute', 1, [[0.3, 0, 0]])
    expect(basesOverlap(unitModels(s, 'B:brute')[0], g)).toBe(true)
    expect(losService.inCombat(s, 'A:guard', 'B:boss')).toBe(true)
    expect(losService.inCombat(s, 'A:guard', 'B:brute')).toBe(true)
  })
})
