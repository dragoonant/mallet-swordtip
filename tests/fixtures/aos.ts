// AoS Spearhead test fixtures (13-engine-port-plan WP1, 12-rules-test-checklist "Fixtures"): the checklist units Guard,
// Brute, Boss, Knight, Cannon, Hawk as minimal warscrolls, two Spearhead armies, a 30" x 22" battleplan and two terrain
// layouts, plus a setup module that deploys every army automatically so reducer / phase tests start at round 1.
// Synthetic data only: no real army, no rules text.
import type {
  AbilityDescriptor, CombatPatrolData, DataBundle, DatasheetData, MissionData, Polygon, WeaponData,
} from '../../src/data/types'
import {
  assignSides, createEngine, createGameState, DEFAULT_MODULES, deploymentZone, ENGINE_VERSION, setModelPos, unitModels,
  type EngineApi, type GameSetup, type GameState, type ModuleTable, type PhaseModule, type PlayerId, type PlayerSetup, type Services,
} from '../../src/engine'
import { pingModule, type PingOptions } from './modules'

const rect = (x0: number, z0: number, x1: number, z1: number): Polygon => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]

// ---------- weapons (Atk / Hit / Wnd / Rend / Dmg from the checklist table) ----------
const w = (id: string, name: string, type: 'ranged' | 'melee', range: number, A: number | string, hit: number, wound: number, rend: number, D: number | string, abilities: WeaponData['abilities'] = []): WeaponData =>
  ({ id, name, type, range, A, skill: hit, wound, rend, D, abilities })

const weapons: WeaponData[] = [
  w('fx.w.guard-spear', 'Guard spear', 'melee', 0, 2, 4, 4, 0, 1),
  w('fx.w.brute-axe', 'Brute axe', 'melee', 0, 3, 4, 3, 1, 2),
  w('fx.w.boss-blade', 'Boss blade', 'melee', 0, 8, 4, 2, 1, 2),
  w('fx.w.knight-pistol', 'Knight pistol', 'ranged', 10, 2, 3, 4, 1, 1, [{ ability: 'SHOOT_IN_COMBAT' }]),
  w('fx.w.knight-lance', 'Knight lance', 'melee', 0, 5, 3, 4, 1, 2),
  w('fx.w.knight-hooves', 'Hooves', 'melee', 0, 2, 5, 3, 0, 1, [{ ability: 'COMPANION' }]),
  w('fx.w.cannon-shot', 'Cannon shot', 'ranged', 24, 2, 4, 2, 2, 'D3+2'),
  w('fx.w.hawk-talons', 'Talons', 'melee', 0, 3, 3, 3, 1, 1),
]

// ---------- warscrolls ----------
const ds = (id: string, name: string, keywords: string[], stats: DatasheetData['stats'], count: number, base: DatasheetData['composition'][number]['base'], weaponIds: string[], archetype: 'infantry' | 'heavy' | 'monster' | 'vehicle', abilities: DatasheetData['abilities'] = []): DatasheetData => ({
  id, faction: 'fx', name, keywords, factionKeywords: ['FIXTURE'], stats, spearhead: true,
  composition: [{ modelId: id.split('.').pop() as string, name, min: count, max: count, default: count, base, weapons: { default: weaponIds } }],
  abilities, coreAbilities: [], figure: { archetype, kit: 'test' },
})

const datasheets: DatasheetData[] = [
  ds('fx.guard', 'Guard', ['INFANTRY'], { M: 5, W: 1, Sv: 4, OC: 1 }, 10, { shape: 'round', mm: 32 }, ['fx.w.guard-spear'], 'infantry'),
  ds('fx.brute', 'Brute', ['INFANTRY'], { M: 4, W: 3, Sv: 3, OC: 1 }, 3, { shape: 'round', mm: 40 }, ['fx.w.brute-axe'], 'heavy'),
  ds('fx.boss', 'Boss', ['HERO', 'INFANTRY'], { M: 4, W: 8, Sv: 3, OC: 2 }, 1, { shape: 'round', mm: 40 }, ['fx.w.boss-blade'], 'heavy'),
  ds('fx.knight', 'Knight', ['HERO', 'CAVALRY'], { M: 10, W: 7, Sv: 3, OC: 2 }, 1, { shape: 'oval', mm: 90, mm2: 52 }, ['fx.w.knight-pistol', 'fx.w.knight-lance', 'fx.w.knight-hooves'], 'monster'),
  ds('fx.cannon', 'Cannon', ['WAR MACHINE'], { M: 3, W: 8, Sv: 4, OC: 2 }, 1, { shape: 'oval', mm: 120, mm2: 92 }, ['fx.w.cannon-shot'], 'vehicle'),
  ds('fx.hawk', 'Hawk', ['FLY'], { M: 12, W: 4, Sv: 4, OC: 1 }, 1, { shape: 'round', mm: 50 }, ['fx.w.hawk-talons'], 'monster'),
]

// ---------- abilities (placeholders; tests attach effects or code hooks as needed) ----------
const ability = (id: string, name: string, extra: Partial<AbilityDescriptor> = {}): AbilityDescriptor => ({ id, name, text: `${name} (fixture).`, trigger: 'always', ...extra })

const abilities: AbilityDescriptor[] = [
  ability('fx.a.order-trait', 'Order trait'),
  ability('fx.a.chaos-trait', 'Chaos trait'),
  ability('fx.a.order-rule', 'Order army rule'),
  ability('fx.a.chaos-rule', 'Chaos army rule'),
  // regiment abilities: activated, Your Hero Phase / Your Charge Phase
  ability('fx.a.order-regiment-1', 'Order regiment one', { trigger: 'activated', timing: { kind: 'phase', phase: 'command', whose: 'your' }, limit: 'oncePerTurnArmy' }),
  ability('fx.a.order-regiment-2', 'Order regiment two', { trigger: 'activated', timing: { kind: 'phase', phase: 'charge', whose: 'your' }, limit: 'oncePerTurnArmy' }),
  ability('fx.a.chaos-regiment-1', 'Chaos regiment one', { trigger: 'activated', timing: { kind: 'phase', phase: 'fight', whose: 'any' }, limit: 'oncePerTurnArmy' }),
  ability('fx.a.chaos-regiment-2', 'Chaos regiment two', { trigger: 'activated', timing: { kind: 'endOfTurn', whose: 'your' }, limit: 'oncePerTurnArmy' }),
  // enhancement effects (bearer = general)
  ability('fx.a.keen-edge', 'Keen edge', { effect: { modifyRoll: { roll: 'hit', value: 1 } }, trigger: 'hitRoll', scope: { who: 'bearer' } }),
  ability('fx.a.thick-hide', 'Thick hide', { scope: { who: 'bearer' } }),
  // reserve arrival (Ere We Go style, data params per 13-port-plan §1.2 movement row); attach with `reserve: { ability }`
  ability('fx.a.ambush', 'Ambush', { trigger: 'activated', timing: { kind: 'phase', phase: 'movement', whose: 'your' }, fromRound: 3, params: { fromRound: 3, minEnemyDistance: 6, anywhere: true } }),
]

const enhancementIds = ['fx.e.keen-edge', 'fx.e.thick-hide']

const army = (id: string, faction: string, trait: string, regiments: [string, string], units: CombatPatrolData['units']): CombatPatrolData => ({
  id, faction, name: id, mode: 'spearhead', warlord: 'boss', units, stratagems: [], secondaries: [],
  enhancements: enhancementIds.map((e, i) => ({ id: e, default: i === 0 })),
  battleTraits: [trait], regimentAbilities: [{ id: regiments[0], default: true }, { id: regiments[1], default: false }],
})

const armies: CombatPatrolData[] = [
  army('fx.order.army', 'fx.order', 'fx.a.order-trait', ['fx.a.order-regiment-1', 'fx.a.order-regiment-2'], [
    { ref: 'boss', datasheet: 'fx.boss', size: 1 },
    { ref: 'guard', datasheet: 'fx.guard', size: 10 },
    { ref: 'knight', datasheet: 'fx.knight', size: 1 },
    { ref: 'cannon', datasheet: 'fx.cannon', size: 1 },
  ]),
  army('fx.chaos.army', 'fx.chaos', 'fx.a.chaos-trait', ['fx.a.chaos-regiment-1', 'fx.a.chaos-regiment-2'], [
    { ref: 'boss', datasheet: 'fx.boss', size: 1 },
    { ref: 'brute', datasheet: 'fx.brute', size: 3 },
    { ref: 'hawk', datasheet: 'fx.hawk', size: 1 },
    { ref: 'guard', datasheet: 'fx.guard', size: 10 },
  ]),
]

// ---------- battleplan: 30" x 22", horizontal split at z = 0, deploy areas more than 6" from enemy territory ----------
export const AOS_TERRITORIES = { A: rect(-15, -11, 15, 0), B: rect(-15, 0, 15, 11) }
export const AOS_DEPLOY = { A: rect(-15, -11, 15, -6), B: rect(-15, 6, 15, 11) }

const sphScoring = (code: string): MissionData['scoring'][number] => ({ id: code, when: 'turn.end', rounds: { from: 1, to: 4 }, who: 'active', rule: 'custom', code, pointsPer: 1, cap: 1 })

const mission: MissionData = {
  id: 'fx.mission', name: 'Fixture Clash', format: 'spearhead', board: { w: 30, h: 22 },
  territories: AOS_TERRITORIES, deploymentZones: AOS_DEPLOY,
  objectives: [
    { id: 'obj-c', x: 0, z: 0, radius: 3, name: 'Centre' },
    { id: 'obj-w', x: -10, z: 0, radius: 3, name: 'West' },
    { id: 'obj-e', x: 10, z: 0, radius: 3, name: 'East' },
    { id: 'obj-a', x: -6, z: -6, radius: 3, name: 'South' },
    { id: 'obj-b', x: 6, z: 6, radius: 3, name: 'North' },
  ],
  objectiveRange: 0, objectiveMarkerRadius: 3, rounds: 4, firstTurn: 'attackerChoice',
  scoring: [sphScoring('sph.vp.holdOne'), sphScoring('sph.vp.holdTwo'), sphScoring('sph.vp.holdMore')],
  rules: [], victory: { tie: 'draw' }, terrainLayouts: ['fx.terrain.open', 'fx.terrain.standard'],
}

function build(): DataBundle {
  return {
    version: 'fx-1',
    factions: {
      'fx.order': { id: 'fx.order', name: 'Fixture Order', factionKeyword: 'FIXTURE', armyRule: 'fx.a.order-rule', detachments: [], paintScheme: { primary: '#2255aa', secondary: '#222222', trim: '#dddddd', metal: '#888888', decal: '#ffffff' }, combatPatrols: ['fx.order.army'] },
      'fx.chaos': { id: 'fx.chaos', name: 'Fixture Chaos', factionKeyword: 'FIXTURE', armyRule: 'fx.a.chaos-rule', detachments: [], paintScheme: { primary: '#aa3322', secondary: '#222222', trim: '#dddddd', metal: '#888888', decal: '#ffffff' }, combatPatrols: ['fx.chaos.army'] },
    },
    datasheets: Object.fromEntries(datasheets.map((d) => [d.id, d])),
    weapons: Object.fromEntries(weapons.map((x) => [x.id, x])),
    abilities: Object.fromEntries(abilities.map((a) => [a.id, a])),
    stratagems: {},
    enhancements: {
      'fx.e.keen-edge': { id: 'fx.e.keen-edge', faction: 'fx', name: 'Keen Edge', text: 'Fixture enhancement.', cost: 0, restriction: {}, effect: 'fx.a.keen-edge' },
      'fx.e.thick-hide': { id: 'fx.e.thick-hide', faction: 'fx', name: 'Thick Hide', text: 'Fixture enhancement.', cost: 0, restriction: {}, effect: 'fx.a.thick-hide' },
    },
    patrols: Object.fromEntries(armies.map((a) => [a.id, a])),
    missions: { 'fx.mission': mission },
    terrainLayouts: {
      'fx.terrain.open': { id: 'fx.terrain.open', name: 'Open field', board: { w: 30, h: 22 }, pieces: [] },
      // SPH-14.4-like pieces: a large ruin (two 4" walls, cover / obscuring / unstable) and a small 2" shrine
      'fx.terrain.standard': {
        id: 'fx.terrain.standard', name: 'Fixture standard', board: { w: 30, h: 22 },
        pieces: [
          { id: 'ruin-1', kind: 'ruin', pos: { x: -6, z: 2 }, rot: 0, footprint: rect(-2.5, -1.5, 2.5, 1.5), height: 4, traits: ['cover', 'obscuring', 'unstable'], walls: [{ a: { x: -2.5, z: -1.5 }, b: { x: 2.5, z: -1.5 }, height: 4 }, { a: { x: -2.5, z: -1.5 }, b: { x: -2.5, z: 1.5 }, height: 4 }] },
          { id: 'shrine-1', kind: 'crate', pos: { x: 6, z: -2 }, rot: 0, footprint: rect(-1.5, -1, 1.5, 1), height: 2, traits: ['cover', 'unstable'] },
        ],
      },
    },
  }
}

export function makeAosBundle(): DataBundle { return structuredClone(build()) }
export const aosBundle: DataBundle = makeAosBundle()
export function withAosBundle(patch: (b: DataBundle) => void): DataBundle {
  const b = makeAosBundle()
  patch(b)
  return b
}

// ---------- setup ----------
export function makeAosPlayer(pid: PlayerId, overrides: Partial<PlayerSetup> = {}): PlayerSetup {
  return pid === 'A'
    ? { name: 'Order', faction: 'fx.order', patrolId: 'fx.order.army', enhancementId: 'fx.e.keen-edge', ...overrides }
    : { name: 'Chaos', faction: 'fx.chaos', patrolId: 'fx.chaos.army', enhancementId: 'fx.e.keen-edge', ...overrides }
}

// A = attacker in territory A, first turn pre-filled to A (pass firstTurn: 'rollOff' to get the round-1 choice)
export function makeAosSetup(overrides: Partial<GameSetup> = {}): GameSetup {
  return {
    mode: 'spearhead', missionId: 'fx.mission', terrainLayoutId: 'fx.terrain.open',
    players: { A: makeAosPlayer('A'), B: makeAosPlayer('B') },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'fx-1', ...overrides,
  }
}

// a GameState straight from createGameState (no reducer), sides assigned, nothing deployed
export function aosState(overrides: Partial<GameSetup> = {}, bundle: DataBundle = aosBundle): GameState {
  const s = createGameState(makeAosSetup(overrides), bundle, 'fx', ENGINE_VERSION)
  if (!s.players.A.side) assignSides(s, 'A')
  return s
}

// deploys every non-reserve unit of `player` in its deploy area: units side by side along x, each unit a 2-row block
// with 0.3" gaps (coherent under the ½" rule, 7+ models get 2 neighbours)
export function autoDeployAos(state: GameState, player: PlayerId): void {
  const zone = deploymentZone(state, player)
  const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  let cursor = minX + 0.5
  for (const unit of Object.values(state.units)) {
    if (unit.player !== player || unit.location !== 'reserves' || unit.reserveArrival) continue
    const models = unitModels(state, unit.id)
    const r = Math.max(...models.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
    const step = 2 * r + 0.3
    const perRow = Math.ceil(models.length / 2)
    const midZ = (minZ + maxZ) / 2
    models.forEach((m, i) => {
      const col = i % perRow, row = Math.floor(i / perRow)
      setModelPos(m, { x: cursor + r + col * step, y: 0, z: midZ + (row === 0 ? -1 : 1) * (models.length > 1 ? step / 2 : 0) }, player === 'A' ? 0 : Math.PI)
    })
    unit.location = 'board'
    cursor += perRow * step + 1
    if (cursor > maxX) throw new Error(`autoDeployAos: ${player}'s units do not fit the deploy area`)
  }
}

// setup + deployment in one go, no decisions: sides from setup (or A attacks), attacker deploys all, then the defender
export const aosAutoSetupModule: PhaseModule = {
  name: 'aos-auto-setup',
  enter(ctx) { ctx.state.step = ctx.state.phase === 'setup' ? 'preBattle' : 'deploy' },
  advance(ctx) {
    const s = ctx.state
    if (s.phase === 'setup') {
      if (!s.players.A.side) assignSides(s, typeof s.setup.sides === 'object' ? s.setup.sides.attacker : 'A')
      return 'done'
    }
    const attacker: PlayerId = s.players.A.side === 'attacker' ? 'A' : 'B'
    for (const p of [attacker, attacker === 'A' ? 'B' : 'A'] as PlayerId[]) {
      autoDeployAos(s, p)
      for (const u of Object.values(s.units)) if (u.player === p && u.location === 'board') ctx.emit({ type: 'UnitDeployed', unitId: u.id, toReserves: false, player: p })
    }
    return 'done'
  },
  handle: () => ({ code: 'E_NOT_AN_OPTION', reason: 'aos-auto-setup raises no decisions' }),
}

// ping phases for every battle phase + the auto setup module (13-port-plan WP1 "ping phase modules")
export function aosPingPhases(opts: PingOptions = {}): ModuleTable['phases'] {
  return {
    setup: aosAutoSetupModule, deployment: aosAutoSetupModule,
    command: pingModule('command', opts), movement: pingModule('movement', opts), shooting: pingModule('shooting', opts),
    charge: pingModule('charge', opts), fight: pingModule('fight', opts),
  }
}

export function aosPingEngine(opts: PingOptions = {}, services: Partial<Services> = {}, topics: ModuleTable['topics'] = {}): EngineApi {
  return createEngine({ phases: aosPingPhases(opts), services: { ...DEFAULT_MODULES.services, ...services }, topics: { ...DEFAULT_MODULES.topics, ...topics } })
}
