// Nighthaunt (Slasher Host) code hooks: docs/spec/factions/nighthaunt.md (NH-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/nighthaunt/abilities.json uses. What each hook
// needs from data:
//
//  nighthauntWaveOfTerror (BT-2)      army trait, charge / any, keyword UNLIMITED (the per-unit limit is kept here with phase marks
//        `nh:wave:<unitId>`); declare an enemy unit within params.range of a friendly unit that charged this phase with a charge roll
//        (modified total) of params.minRoll or more. The qualifying friendly unit nearest the target is the user. Strike-last for the turn.
//  nighthauntDeathStalkers (RA-1)     regiment, start of round / any, oncePerBattle, only in round 1; declare any enemy unit. The pick is
//        kept in Player.oathTargetUnitId; every friendly unit carries a battle-long effect { when oathTarget + melee, AP -params.rend }
//        (resolve and ensureEffects put it on units that arrive later).
//  nighthauntDiscorporate (AB-1)      hero phase / your; declare a friendly unit wholly within params.range of the Knight (the Knight itself
//        counts); grants params.grant for the descriptor's duration.
//  nighthauntDrawnToWar (AB-2)        passive on the Spirit Hosts; `adjustFeelNoPain` gives the holder player's general Ward (params.ward)
//        while it is within params.range of the Hosts.
//  nighthauntReapedLikeCorn (AB-3)    passive; `produce` at onHitRoll lowers the crit threshold to params.critOn for melee attacks on a
//        unit of params.minModels or more models. ensureEffects keeps the battle-long marker effect `produce` answers on.
//  nighthauntSoulfireRing (ENH-1)     end of any turn / any, no limit; the bearer's unit slew a model with combat attacks this turn
//        (attack.ts slewInFightThisTurn) and is damaged: Heal (params.heal) it.
//  nighthauntCloakedInShadow (ENH-2)  passive marker; forbidsShootingTarget / forbidsFightTarget refuse the bearer's unit to every enemy
//        unit except the one that first declared attacks on it this phase (attack.ts firstAttackerThisPhase).
//  nighthauntBeaconOfNagashizzar (ENH-3)  hero phase / your, oncePerBattle; returns params.count slain models to every friendly unit.
// Ethereal, Chorus of Terror, Chilling Horde and Shadow's Edge are plain descriptors; the warscroll Ward (6+) is datasheet data.
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { GameState, PlayerId, UnitId } from '../types'
import { EPS } from '../geometry'
import { firstAttackerThisPhase, slewInFightThisTurn } from '../attack'
import { diceExprMean } from '../dice'
import { effectService } from '../effects'
import { modelStats } from '../state'
import type { EngineContext } from '../modules'
import {
  announce, healUnit, isDamaged, liveModels, onBoard, returnSlainModels, returnableModels, unitGap, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

const boardOf = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}
// the params of the first ability in this game that names the code (army-level abilities have no holder unit to ask)
const paramsOfCode = (state: GameState, code: string): Record<string, unknown> =>
  Object.values(state.abilities).find((a) => a.code === code)?.params ?? {}
const pickedOk = (list: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return list.length > 0 && (!picked || list.includes(picked))
}

// ---------- NH-BT-2 Wave of Terror ----------
const CODE_WAVE = 'nighthauntWaveOfTerror'
const waveMark = (unitId: UnitId): string => `nh:wave:${unitId}`

// friendly units that charged this phase with a roll of params.minRoll+ and have not used it yet this phase
function waveUsers(state: GameState, player: PlayerId): UnitId[] {
  const min = num(paramsOfCode(state, CODE_WAVE).minRoll, 10)
  return boardOf(state, player).filter((id) => {
    const t = state.units[id].turn
    return t.chargedThisTurn && (t.chargeRoll ?? 0) >= min && !state.phaseState.marks.includes(waveMark(id))
  })
}

function waveTargets(state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] {
  const p = player ?? state.activePlayer
  const range = num(paramsOfCode(state, CODE_WAVE).range, 1)
  const users = waveUsers(state, p)
  if (users.length === 0) return []
  return boardOf(state, other(p)).filter((e) => users.some((u) => unitGap(state, u, e) <= range + EPS))
}

const waveActivate: ActivatedAbilityHook & { targets?(state: GameState, unitId: UnitId | null, player?: PlayerId): UnitId[] } = {
  canUse: (state, _unitId, use) => pickedOk(waveTargets(state, null, use.player), use),
  targets: waveTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const range = num(paramsOfCode(s, CODE_WAVE).range, 1)
    // the qualifying unit nearest the target is the one that uses it (ties by id)
    const user = waveUsers(s, use.player)
      .filter((u) => unitGap(s, u, target.id) <= range + EPS)
      .sort((a, b) => unitGap(s, a, target.id) - unitGap(s, b, target.id) || (a < b ? -1 : 1))[0]
    if (!user) return
    s.phaseState.marks.push(waveMark(user))
    target.turn.fightsLast = true
    announce(ctx, { ...use, unitId: user }, target.id, `Wave of Terror: ${s.units[user].name} frightens ${target.name}, which fights last for the rest of the turn`)
  },
}
const nighthauntWaveOfTerror: EngineCodeHook = { name: CODE_WAVE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: waveActivate }

// ---------- NH-RA-1 Death Stalkers ----------
const CODE_STALKERS = 'nighthauntDeathStalkers'

const stalkersEffect = (state: GameState, abilityId: string) => ({
  when: { oathTarget: true, weaponType: 'melee' as const },
  modifyStat: { stat: 'AP' as const, value: -num(state.abilities[abilityId]?.params?.rend, 1) },
})

// every friendly unit on the table carries the battle-long effect once the pick is made (units that arrive later get it too)
function markStalkers(ctx: EngineContext, player: PlayerId): void {
  const s = ctx.state
  const abilityId = s.players[player]?.regimentAbilityId
  if (!abilityId || s.abilities[abilityId]?.code !== CODE_STALKERS || !s.players[player].oathTargetUnitId) return
  for (const id of boardOf(s, player)) {
    if (s.units[id].effects.some((e) => e.sourceAbilityId === abilityId)) continue
    effectService.grant(ctx, id, stalkersEffect(s, abilityId), { sourceAbilityId: abilityId, sourceUnitId: id, scope: { who: 'self' }, duration: 'battle' })
  }
}

const stalkersTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] => boardOf(state, other(player ?? state.activePlayer))

const stalkersActivate: ActivatedAbilityHook & { targets?(state: GameState, unitId: UnitId | null, player?: PlayerId): UnitId[] } = {
  canUse: (state, _unitId, use) => state.round === 1 && pickedOk(stalkersTargets(state, null, use.player), use),
  targets: stalkersTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    s.players[use.player].oathTargetUnitId = target.id
    markStalkers(ctx, use.player)
    announce(ctx, use, target.id, `Death Stalkers: melee attacks against ${target.name} have +1 Rend for the rest of the battle`)
  },
}
const nighthauntDeathStalkers: EngineCodeHook = {
  name: CODE_STALKERS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: stalkersActivate,
  ensureEffects(ctx) { for (const p of ['A', 'B'] as PlayerId[]) markStalkers(ctx, p) },
}

// ---------- NH-AB-1 Discorporate ----------
const CODE_DISCORPORATE = 'nighthauntDiscorporate'

function discorporateTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramsOfCode(state, CODE_DISCORPORATE).range, 9)
  return boardOf(state, me.player).filter((id) => id === me.id || whollyWithinUnit(state, id, me.id, range))
}

const discorporateActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(discorporateTargets(state, unitId), use),
  targets: discorporateTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const ab = s.abilities[use.abilityId]
    const target = onBoard(s, use.targetUnitIds[0])
    if (!ab || !target) return
    effectService.grant(ctx, target.id, (ab.params?.grant ?? [{ feelNoPain: 5 }]) as never, {
      sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: ab.duration ?? 'untilNextTurn',
    })
    announce(ctx, use, target.id, `Discorporate: ${target.name} has Ward (5+) until the start of your next turn`)
  },
}
const nighthauntDiscorporate: EngineCodeHook = { name: CODE_DISCORPORATE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: discorporateActivate }

// ---------- NH-AB-2 Drawn to War ----------
const nighthauntDrawnToWar: EngineCodeHook = {
  name: 'nighthauntDrawnToWar', kind: 'ability', hook: 'onStatQuery', run: noop,
  adjustFeelNoPain(state, entry, modelId, current) {
    const model = state.models[modelId]
    const holder = onBoard(state, entry.holderUnitId)
    if (!model || !holder) return null
    const general = generalOf(state, holder.player)
    // asked of every source on the table: only the Hosts' own entry answers, and only for the models of its player's general
    if (!general || general === holder.id || model.unitId !== general) return null
    if (unitGap(state, general, holder.id) > num(entry.params.range, 1) + EPS) return null
    return { threshold: Math.min(current ?? 7, num(entry.params.ward, 4)), modifier: 0 }
  },
}

// ---------- NH-AB-3 Reaped Like Corn ----------
const CODE_REAPED = 'nighthauntReapedLikeCorn'

// one battle-long (empty) effect on every unit that holds the datasheet ability (the producer below only answers on an active effect)
function ensureReapedEffects(ctx: EngineContext): void {
  const s = ctx.state
  for (const ab of Object.values(s.abilities)) {
    if (ab.code !== CODE_REAPED) continue
    for (const u of Object.values(s.units)) {
      if (u.location === 'destroyed' || !(s.datasheets[u.datasheetId]?.abilities ?? []).includes(ab.id)) continue
      if (u.effects.some((e) => e.sourceAbilityId === ab.id)) continue
      effectService.grant(ctx, u.id, {}, { sourceAbilityId: ab.id, sourceUnitId: u.id, scope: { who: 'self' }, duration: 'battle' })
    }
  }
}

const nighthauntReapedLikeCorn: EngineCodeHook = {
  name: CODE_REAPED, kind: 'ability', hook: 'onStatQuery', run: noop,
  producesAt: ['onHitRoll'],
  produce(ctx, entry, data) {
    if (!entry.active) return null
    const s = ctx.state
    const attack = data.attack as { kind?: string; attackerUnitId?: UnitId; targetUnitId?: UnitId } | undefined
    if (!attack || attack.kind !== 'melee' || attack.attackerUnitId !== entry.holderUnitId || !attack.targetUnitId) return null
    // the count is taken when the hit roll is made (RULING 8.8)
    if (liveModels(s, attack.targetUnitId).length < num(entry.params.minModels, 5)) return null
    return { kind: 'roll', critThreshold: num(entry.params.critOn, 5) }
  },
  ensureEffects: ensureReapedEffects,
}

// ---------- NH-ENH Soulfire Ring ----------
const CODE_SOULFIRE = 'nighthauntSoulfireRing'

const soulfireActivate: ActivatedAbilityHook = {
  canUse(state, unitId) {
    const me = onBoard(state, unitId)
    return !!me && slewInFightThisTurn(state, me.id) && isDamaged(state, me.id)
  },
  resolve(ctx, use) {
    const me = onBoard(ctx.state, use.unitId)
    if (!me) return
    const n = ctx.rollExpr('D6', { purpose: 'ability', player: use.player, unitId: me.id, commandRerollable: false }).total
    const healed = healUnit(ctx, me.id, n, use.abilityId)
    announce(ctx, use, me.id, `Soulfire Ring: rolled ${n}, ${me.name} heals ${healed}`)
  },
}
const nighthauntSoulfireRing: EngineCodeHook = { name: CODE_SOULFIRE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: soulfireActivate }

// ---------- NH-ENH Cloaked in Shadow ----------
// the bearer's unit may be picked by one enemy unit per phase: the first to declare attacks on it keeps the claim
function cloakForbids(state: GameState, holderUnitId: UnitId, attackerId: UnitId, targetUnitId: UnitId): boolean {
  if (targetUnitId !== holderUnitId) return false
  const first = firstAttackerThisPhase(state, targetUnitId)
  return first !== null && first !== attackerId
}
const nighthauntCloakedInShadow: EngineCodeHook = {
  name: 'nighthauntCloakedInShadow', kind: 'ability', hook: 'onStatQuery', run: noop,
  forbidsShootingTarget: (state, entry, firingUnitId, targetUnitId) => cloakForbids(state, entry.holderUnitId, firingUnitId, targetUnitId),
  forbidsFightTarget: (state, entry, fightingUnitId, targetUnitId) => cloakForbids(state, entry.holderUnitId, fightingUnitId, targetUnitId),
}

// ---------- NH-ENH Beacon of Nagashizzar ----------
const CODE_BEACON = 'nighthauntBeaconOfNagashizzar'

// models that would come back right now: one (params.count) per friendly unit that has slain models to return
const beaconGain = (state: GameState, player: PlayerId, count = 1): number =>
  boardOf(state, player).reduce((n, id) => n + Math.min(count, returnableModels(state, id)), 0)

const beaconActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => !!onBoard(state, unitId) && beaconGain(state, use.player ?? state.activePlayer) > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const count = num(s.abilities[use.abilityId]?.params?.count, 1)
    let back = 0
    let units = 0
    for (const id of boardOf(s, use.player)) {
      const n = returnSlainModels(ctx, id, count, use.abilityId)
      if (n > 0) { back += n; units++ }
    }
    announce(ctx, use, null, `Beacon of Nagashizzar: ${back} slain model${back === 1 ? '' : 's'} return to ${units} unit${units === 1 ? '' : 's'}`)
  },
}
const nighthauntBeaconOfNagashizzar: EngineCodeHook = { name: CODE_BEACON, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: beaconActivate }

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus; null = no opinion) ----------
// below -2 the bot passes instead of using the ability
export function nighthauntAbilityTiming(state: GameState, player: PlayerId, code: string, _unitId: UnitId | null): number | null {
  switch (code) {
    case CODE_BEACON: {
      // once per battle: wait for a crowd (3 models, or a Spirit Host), then take what is there late in the game
      const gain = beaconGain(state, player)
      const host = boardOf(state, player).some((id) => state.units[id].datasheetId.endsWith('spirit-hosts') && returnableModels(state, id) > 0)
      if (gain >= 3 || host) return 0
      if (state.round >= 4 && gain >= 2) return 0
      return state.round >= 5 && gain >= 1 ? 0 : -3
    }
    case CODE_WAVE: case CODE_STALKERS: case CODE_DISCORPORATE: case CODE_SOULFIRE:
      return 0
    default:
      return null
  }
}

// the expected melee attacks a unit swings (flat count or dice mean per model)
function meleeAttacks(state: GameState, unitId: UnitId): number {
  let n = 0
  for (const m of liveModels(state, unitId)) {
    for (const w of m.weapons) {
      const wp = state.weapons[w]
      if (wp && wp.kind === 'melee') n += diceExprMean(wp.A)
    }
  }
  return n
}

export function nighthauntTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_STALKERS: {
      // the enemy unit with the best save among the ones with the most Health: it is the one our Rend helps against most
      if (unit.player === player) return null
      const m = liveModels(state, unitId)[0]
      const sv = m ? modelStats(state, m).Sv : 7
      return woundsLeft(state, unitId) * 0.15 + (7 - sv) * 1.5
    }
    case CODE_WAVE:
      // the enemy unit that swings the most melee attacks
      return unit.player === player ? null : meleeAttacks(state, unitId) * 0.5
    case CODE_DISCORPORATE: {
      // the unit in combat with the most muscle in it, then one with an enemy close enough to charge it, then the Knight
      if (unit.player !== player) return null
      const models = liveModels(state, unitId).length
      const enemies = boardOf(state, other(player))
      const gap = Math.min(99, ...enemies.map((e) => unitGap(state, unitId, e)))
      if (gap <= 3) return 4 + models * 0.6
      if (gap <= 12) return 2 + models * 0.3
      return unitId === generalOf(state, player) ? 0 : -1
    }
    default:
      return null
  }
}

export const nighthauntHooks: Record<string, EngineCodeHook> = {
  nighthauntWaveOfTerror, nighthauntDeathStalkers, nighthauntDiscorporate, nighthauntDrawnToWar, nighthauntReapedLikeCorn,
  nighthauntSoulfireRing, nighthauntCloakedInShadow, nighthauntBeaconOfNagashizzar,
}
