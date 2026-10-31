// Sons of Behemat (Stone Lobbas) code hooks: docs/spec/factions/sons-of-behemat.md (SOB-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/behemat/abilities.json uses. What each hook
// needs from data:
//
//  behematBowledOver (BT-2)       battle trait, shooting / your, declare an enemy unit, declared D6 3+. Target = an enemy unit that friendly
//        shooting attacks allocated damage to this phase (attack.ts damagedByShootingThisPhase). Resolve (only on 3+) leaves an empty marker
//        effect on it, "until the start of your next turn" (expiryOwner = the user, not the holder); `produce` at onChargeRoll turns the
//        marker into a negative charge-roll modifier: lowest die minus highest die, so the total is as if the highest die showed the lowest.
//  behematCloseOneEye (BT-3)      hero phase; the general must be on the table. Target = another friendly unit wholly within params.range
//        of the general; grants params.grant (+1 to ranged hit rolls) until the end of the turn.
//  behematSurlySorts (RA-1)       fight / any, oncePerBattle. Target = a friendly unit in combat; grants params.grant (+1 Attacks, melee).
//  behematArdEad (ENH-1)          fight / any, oncePerBattle; the bearer; grants params.grant (+1 to hit with the 'Eadbutt).
//  behematLuckyRock (ENH-3)       shooting / your, oncePerBattle; the bearer; grants params.grant (+1 Attacks for Hurlin' Rocks).
//  behematHungryGobbler (ENH-4)   end of any turn; the bearer, if its combat attacks slew a model this turn (turn ledger) and it is damaged:
//        Heal (params.heal).
//  behematDropTossRoll (AB-1)     shooting / your, on both datasheets, no target. modesFor offers Drop / Toss / Roll minus the ones another
//        friendly unit took this turn (ledger mission.custom.sobDtr[player] = { key: 'round:activePlayer', used }); canUse needs a mode left
//        and a unit that has not shot yet. Grants the chosen option until the end of the turn.
//  Greedy and Grabby (RA-2) and Humongous Strides (ENH-2) are data only.
//
//  The four grant abilities share one factory (grantHook) but keep their own `code` names so the AI hints can tell them apart.
//  AI hints: behematAbilityTiming / behematTargetBonus / behematModeBonus below are read by src/ai/utility.ts.
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { DiceExpr, Effect } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { EPS } from '../geometry'
import { diceExprMean } from '../dice'
import { damagedByShootingThisPhase, slewInFightThisTurn } from '../attack'
import { effectService } from '../effects'
import { modelStats } from '../state'
import { weaponService } from '../weapons'
import { announce, healUnit, inCombat, isDamaged, liveModels, onBoard, paramOf, unitGap, whollyWithinUnit } from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

const CODE_BOWLED = 'behematBowledOver'
const CODE_COE = 'behematCloseOneEye'
const CODE_SURLY = 'behematSurlySorts'
const CODE_ARD = 'behematArdEad'
const CODE_LUCKY = 'behematLuckyRock'
const CODE_GOBBLER = 'behematHungryGobbler'
const CODE_DTR = 'behematDropTossRoll'
const LEDGER = 'sobDtr'

const unitsOf = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}
const playerOf = (state: GameState, unitId: UnitId | null, use?: { player?: PlayerId }): PlayerId =>
  use?.player ?? (unitId ? state.units[unitId]?.player : undefined) ?? state.activePlayer
const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}
// a number from the params of the (any) ability that carries `code`; the army's battle trait / regiment ability has no unit to read it from
const codeParam = (state: GameState, code: string, key: string, fallback: number): number => {
  const ab = (Object.values(state.abilities) as { code?: string; params?: Record<string, unknown> }[]).find((a) => a.code === code)
  return num(ab?.params?.[key], fallback)
}

// ---------- SOB-BT-3 Close One Eye! / SOB-RA-1 Surly Sorts / SOB-ENH 'Ard 'Ead / SOB-ENH Lucky Rock (one grant on a friendly unit) ----------
type TargetKind = 'self' | 'friendlyInCombat' | 'friendlyWhollyNearGeneral'

function grantTargets(state: GameState, unitId: UnitId | null, player: PlayerId | undefined, kind: TargetKind, code: string): UnitId[] {
  const p = player ?? playerOf(state, unitId)
  switch (kind) {
    case 'self': {
      const u = onBoard(state, unitId)
      return u ? [u.id] : []
    }
    case 'friendlyInCombat':
      return unitsOf(state, p).filter((id) => inCombat(state, id))
    case 'friendlyWhollyNearGeneral': {
      const general = generalOf(state, p)
      if (!general) return []
      const range = codeParam(state, code, 'range', 12)
      return unitsOf(state, p).filter((id) => id !== general && whollyWithinUnit(state, id, general, range))
    }
  }
}

function grantHook(name: string, kind: TargetKind, said: (unitName: string) => string): EngineCodeHook {
  const targetsOf = (state: GameState, unitId: UnitId | null, player?: PlayerId): UnitId[] => grantTargets(state, unitId, player, kind, name)
  const activate: ActivatedAbilityHook & { targets: typeof targetsOf } = {
    canUse: (state, unitId, use) => pickedOk(targetsOf(state, unitId, use.player), use),
    targets: targetsOf,
    resolve(ctx, use) {
      const s = ctx.state
      const ab = s.abilities[use.abilityId]
      const target = onBoard(s, use.targetUnitIds[0])
      if (!ab || !target) return
      effectService.grant(ctx, target.id, (ab.params?.grant ?? []) as Effect[], {
        sourceAbilityId: use.abilityId, sourceUnitId: use.unitId ?? generalOf(s, use.player), scope: { who: 'self' }, duration: 'untilEndOfTurn',
      })
      announce(ctx, use, target.id, said(target.name))
    },
  }
  return { name, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate }
}

const behematCloseOneEye = grantHook(CODE_COE, 'friendlyWhollyNearGeneral', (n) => `Close One Eye!: ${n} adds 1 to hit rolls for its shooting attacks this turn`)
const behematSurlySorts = grantHook(CODE_SURLY, 'friendlyInCombat', (n) => `Surly Sorts: the melee weapons of ${n} have +1 Attacks this turn`)
const behematArdEad = grantHook(CODE_ARD, 'self', (n) => `'Ard 'Ead: ${n} adds 1 to hit rolls with its 'Eadbutt this turn`)
const behematLuckyRock = grantHook(CODE_LUCKY, 'self', (n) => `Lucky Rock: the Hurlin' Rocks of ${n} have +1 Attacks this turn`)

// ---------- SOB-ENH Hungry Gobbler ----------
const gobblerActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId) && slewInFightThisTurn(state, unitId as UnitId) && isDamaged(state, unitId as UnitId),
  resolve(ctx, use) {
    const s = ctx.state
    const bearer = onBoard(s, use.unitId)
    if (!bearer) return
    const n = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'heal', 'D3'), { purpose: 'ability', player: use.player, unitId: bearer.id, commandRerollable: false }).total
    const healed = healUnit(ctx, bearer.id, n, use.abilityId)
    announce(ctx, use, bearer.id, `Hungry Gobbler: Heal (${n}), ${healed} damage removed from ${bearer.name}`)
  },
}
const behematHungryGobbler: EngineCodeHook = { name: CODE_GOBBLER, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: gobblerActivate }

// ---------- SOB-AB-1 Drop, Toss or Roll ----------
const DTR_MODES: { id: string; label: string }[] = [
  { id: 'drop', label: 'Drop: ranged weapons have Shoot in Combat' },
  { id: 'toss', label: 'Toss: +6" to the Range of ranged weapons' },
  { id: 'roll', label: 'Roll: +1 to hit rolls for shooting attacks' },
]
type DtrLedger = Partial<Record<PlayerId, { key: string; used: string[] }>>
const turnKey = (s: GameState): string => `${s.round}:${s.activePlayer}`
const dtrLedger = (s: GameState): DtrLedger => (s.mission.custom[LEDGER] as DtrLedger | undefined) ?? {}
// options the player's army has already handed out this turn (a ledger from an earlier turn counts as empty)
export function dtrUsed(state: GameState, player: PlayerId): string[] {
  const l = dtrLedger(state)[player]
  return l && l.key === turnKey(state) ? l.used : []
}
const dtrAvailable = (state: GameState, player: PlayerId): { id: string; label: string }[] => {
  const used = dtrUsed(state, player)
  return DTR_MODES.filter((m) => !used.includes(m.id))
}

const dtrActivate: ActivatedAbilityHook = {
  // before the unit shoots, and only while an option is left
  canUse: (state, unitId, use) => {
    const u = onBoard(state, unitId)
    return !!u && !u.turn.shotThisPhase && dtrAvailable(state, use.player ?? u.player).length > 0
  },
  modesFor: (state, unitId, player) => dtrAvailable(state, player ?? playerOf(state, unitId)),
  resolve(ctx, use) {
    const s = ctx.state
    const self = onBoard(s, use.unitId)
    const mode = use.modeId
    if (!self || !mode || !DTR_MODES.some((m) => m.id === mode) || dtrUsed(s, use.player).includes(mode)) return
    s.mission.custom = { ...s.mission.custom, [LEDGER]: { ...dtrLedger(s), [use.player]: { key: turnKey(s), used: [...dtrUsed(s, use.player), mode] } } }
    const grant = (effect: Effect): void => {
      effectService.grant(ctx, self.id, effect, { sourceAbilityId: use.abilityId, sourceUnitId: self.id, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    }
    if (mode === 'drop') {
      grant({ when: { weaponType: 'ranged' }, grantWeaponAbility: { ability: 'SHOOT_IN_COMBAT' } })
      announce(ctx, use, self.id, `Drop: the ranged weapons of ${self.name} have Shoot in Combat this turn`)
    } else if (mode === 'toss') {
      const extra = num(paramOf(s, use.abilityId, 'range', 6), 6)
      grant({ when: { weaponType: 'ranged' }, modifyStat: { stat: 'range', value: extra } })
      announce(ctx, use, self.id, `Toss: the ranged weapons of ${self.name} have +${extra}" Range this turn`)
    } else {
      grant({ when: { weaponType: 'ranged' }, modifyRoll: { roll: 'hit', value: 1 } })
      announce(ctx, use, self.id, `Roll: ${self.name} adds 1 to hit rolls for its shooting attacks this turn`)
    }
  },
}
const behematDropTossRoll: EngineCodeHook = { name: CODE_DTR, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: dtrActivate }

// ---------- SOB-BT-2 Bowled Over ----------
// enemy units on the table that a shooting attack of any friendly unit allocated damage to in this phase
function bowledTargets(state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] {
  const p = player ?? state.activePlayer
  const out = new Set<UnitId>()
  for (const f of Object.values(state.units)) {
    if (f.player !== p) continue
    for (const t of damagedByShootingThisPhase(state, f.id)) if (onBoard(state, t) && state.units[t].player !== p) out.add(t)
  }
  return [...out].sort()
}

const bowledActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => pickedOk(bowledTargets(state, null, use.player), use),
  targets: bowledTargets as ActivatedAbilityHook['targets'],
  // abilities.ts rolls the declared D6 and only calls resolve on the 3+
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    // a newer mark replaces an older one; it ends at the start of the user's next turn, not the holder's (the default expiry)
    target.effects = target.effects.filter((e) => e.sourceAbilityId !== use.abilityId)
    effectService.grant(ctx, target.id, {}, { sourceAbilityId: use.abilityId, sourceUnitId: null, scope: { who: 'self' }, duration: 'untilNextTurn', expiryOwner: use.player })
    announce(ctx, use, target.id, `Bowled Over: until the start of the next turn, the highest dice of every charge roll for ${target.name} changes to the lowest`)
  },
}

const behematBowledOver: EngineCodeHook = {
  name: CODE_BOWLED, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: bowledActivate,
  producesAt: ['onChargeRoll'],
  // the marked unit's charge roll: the highest dice becomes the lowest. Applied after re-rolls as a negative modifier (the total is the
  // same as rewriting the die); with 2D6 that is twice the lower die, with extra charge dice only the single highest die changes
  produce(_ctx, entry, data) {
    const charger = data.chargingUnitId as UnitId | undefined
    if (!entry.active || !charger || charger !== entry.holderUnitId) return null
    const dice = (data.roll as { roll?: { dice?: number[] } } | undefined)?.roll?.dice
    if (!dice || dice.length < 2) return null
    const modifier = Math.min(...dice) - Math.max(...dice)
    return modifier === 0 ? null : { kind: 'roll', modifier }
  },
}

// ---------- AI estimates (kept here so the engine does not import src/ai) ----------
const rollP = (target: number): number => Math.max(1 / 6, Math.min(5 / 6, (7 - target) / 6))

interface EstimateOpts { extraA?: number; extraRange?: number; hitBonus?: number; onlyWeaponId?: string }

// expected damage `attackerId` deals to `targetId` with one activation of its melee (or ranged) weapons
function attackEstimate(state: GameState, attackerId: UnitId, targetId: UnitId, kind: 'melee' | 'ranged', o: EstimateOpts = {}): number {
  const defenders = liveModels(state, targetId)
  if (defenders.length === 0) return 0
  const dst = modelStats(state, defenders[0])
  const gap = kind === 'ranged' ? unitGap(state, attackerId, targetId) : 0
  let total = 0
  for (const m of liveModels(state, attackerId)) {
    for (const wid of m.weapons) {
      if (o.onlyWeaponId && wid !== o.onlyWeaponId) continue
      const w = weaponService.effectiveWeapon(state, m.id, wid)
      if (!w || w.kind !== kind) continue
      if (kind === 'ranged' && w.range + (o.extraRange ?? 0) + EPS < gap) continue
      const attacks = diceExprMean(w.A) + (o.extraA ?? 0)
      const hits = attacks * (w.skill === null ? 1 : rollP(Math.max(2, w.skill - (o.hitBonus ?? 0))))
      const need = dst.Sv + w.rend
      const unsaved = dst.noSave || need > 6 ? 1 : 1 - rollP(need)
      let dmg = hits * rollP(w.wound) * unsaved * diceExprMean(w.D)
      if (dst.ward !== null) dmg *= 1 - rollP(dst.ward)
      total += dmg
    }
  }
  return total
}

const enemiesOf = (state: GameState, player: PlayerId): UnitId[] => unitsOf(state, other(player))
const nearestEnemyGap = (state: GameState, player: PlayerId, unitId: UnitId): number =>
  Math.min(99, ...enemiesOf(state, player).map((e) => unitGap(state, unitId, e)))
const heldBy = (state: GameState, unitId: UnitId, code: string): boolean =>
  state.units[unitId]?.effects.some((e) => state.abilities[e.sourceAbilityId]?.code === code) === true

const BASE_RANGE = 12
const TOSS_RANGE = 6

// the option the bot gives a Rock-hurler: Drop in combat, Toss for a target only the extra range reaches, else Roll (unless Close One
// Eye! already gave +1 to hit, which the cap makes redundant). null = nothing is worth taking
function dtrBest(state: GameState, unitId: UnitId, available: string[]): string | null {
  const unit = onBoard(state, unitId)
  if (!unit) return null
  if (inCombat(state, unitId)) return available.includes('drop') ? 'drop' : null
  const gap = nearestEnemyGap(state, unit.player, unitId)
  const reachFar = enemiesOf(state, unit.player).some((e) => { const g = unitGap(state, unitId, e); return g > BASE_RANGE + EPS && g <= BASE_RANGE + TOSS_RANGE + EPS })
  if (gap > BASE_RANGE + EPS) return reachFar && available.includes('toss') ? 'toss' : null
  if (!heldBy(state, unitId, CODE_COE) && available.includes('roll')) return 'roll'
  return reachFar && available.includes('toss') ? 'toss' : null
}

// friendly units that could still shoot this phase (not yet shot, did not run or retreat, an enemy within the longest reach)
function shootersLeft(state: GameState, player: PlayerId): UnitId[] {
  return unitsOf(state, player).filter((id) => {
    const t = state.units[id].turn
    if (t.shotThisPhase || t.moveType === 'advance' || t.moveType === 'fallBack') return false
    return nearestEnemyGap(state, player, id) <= BASE_RANGE + TOSS_RANGE + EPS
  })
}

// the combat attacks Surly Sorts adds: what +1 Attacks is worth to `unitId` against its best target, and whether it turns a miss into a kill
function surlyGain(state: GameState, unitId: UnitId): { gain: number; finishes: boolean } {
  let gain = 0
  let finishes = false
  for (const e of Object.values(state.units)) {
    if (e.player === state.units[unitId].player || e.location !== 'board' || unitGap(state, unitId, e.id) > 3 + EPS) continue
    const base = attackEstimate(state, unitId, e.id, 'melee')
    const more = attackEstimate(state, unitId, e.id, 'melee', { extraA: 1 })
    gain = Math.max(gain, more - base)
    if (more >= woundsLeft(state, e.id) && base < woundsLeft(state, e.id)) finishes = true
  }
  return { gain, finishes }
}

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus / abilityModeBonus; null = no opinion) ----------
// below -2 the bot passes instead of using the ability. The abilityUse options of a datasheet ability carry the user's unit in `unitId`
// when utility.ts passes it (it does for the codes starting with 'behemat'); army abilities and the general's enhancements fall back to the general.
export function behematAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  const general = generalOf(state, player)
  switch (code) {
    case CODE_GOBBLER: return 2
    case CODE_COE: return general ? 1 : -3
    case CODE_BOWLED:
      // after the last shot: the targets are only known once something was hit, and a later gargant may hit something else
      return shootersLeft(state, player).length > 0 ? -3 : 1
    case CODE_SURLY: {
      // the first fight in which +1 Attacks finishes a unit off, else the general's first fight (the last round uses it on anything)
      const mine = unitsOf(state, player).filter((id) => inCombat(state, id) && !state.units[id].turn.foughtThisPhase)
      if (mine.length === 0) return -3
      if (mine.some((id) => surlyGain(state, id).finishes)) return 1
      if (general && mine.includes(general)) return 1
      return state.round >= 4 ? 1 : -3
    }
    case CODE_ARD:
      return general && inCombat(state, general) && !state.units[general].turn.foughtThisPhase ? 1 : -3
    case CODE_LUCKY: {
      if (!general || state.units[general].turn.shotThisPhase) return -3
      return nearestEnemyGap(state, player, general) <= BASE_RANGE + TOSS_RANGE + EPS ? 1 : -3
    }
    case CODE_DTR: {
      // the better shooter picks first; a unit with no worthwhile option leaves the options for the others
      const candidates = unitId ? [unitId] : unitsOf(state, player)
      const avail = dtrAvailable(state, player).map((m) => m.id)
      let best = -3
      for (const id of candidates) {
        const u = onBoard(state, id)
        if (!u || u.player !== player || u.turn.shotThisPhase) continue
        const mode = dtrBest(state, id, avail)
        if (!mode) continue
        const dmg = Math.max(0, ...enemiesOf(state, player).map((e) => attackEstimate(state, id, e, 'ranged', { extraRange: TOSS_RANGE })))
        best = Math.max(best, 1 + dmg * 0.02)
      }
      return best
    }
    default:
      return null
  }
}

export function behematTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_COE: {
      // the gargant with the most enemy units it can reach this turn (12" of range plus a Move), and no mark on it yet
      const reach = enemiesOf(state, player).reduce((n, e) => n + Math.max(0, 1 - unitGap(state, unitId, e) / 30), 0)
      return reach * 3 - (heldBy(state, unitId, CODE_COE) ? 5 : 0)
    }
    case CODE_SURLY: {
      if (unit.turn.foughtThisPhase) return -5
      const g = surlyGain(state, unitId)
      return g.gain * 0.5 + (g.finishes ? 3 : 0)
    }
    case CODE_BOWLED: {
      // the damaged enemy that would hit us hardest on the charge, close enough to charge soon
      const mine = unitsOf(state, player)
      const threat = Math.max(0, ...mine.map((m) => attackEstimate(state, unitId, m, 'melee')))
      const near = mine.some((m) => unitGap(state, unitId, m) <= 14)
      return threat * 0.3 + (near ? 2 : 0)
    }
    default:
      return null
  }
}

// the unit behind an abilityUse option id `<abilityId>#<unitId>` of a Behemat ability (the options carry no unit hint); null for anything else
export function behematOptionUnit(state: GameState, optionId: string): UnitId | null {
  const [abilityId, unitId] = optionId.split('#')
  if (!state.abilities[abilityId]?.code?.startsWith('behemat') || !unitId || !state.units[unitId]) return null
  return unitId
}

// the option of a "choose one" ability the bot prefers: Drop, Toss or Roll
export function behematModeBonus(state: GameState, code: string, unitId: UnitId | null, optionId: string): number | null {
  if (code !== CODE_DTR || !unitId) return null
  const unit = state.units[unitId]
  if (!unit) return null
  const best = dtrBest(state, unitId, dtrAvailable(state, unit.player).map((m) => m.id))
  return best === optionId ? 4 : 0
}

export const behematHooks: Record<string, EngineCodeHook> = {
  behematBowledOver, behematCloseOneEye, behematSurlySorts, behematArdEad, behematLuckyRock, behematHungryGobbler, behematDropTossRoll,
}
