// Ossiarch Bonereapers (Mortisan Elite) code hooks: docs/spec/factions/ossiarch-bonereapers.md (OBR-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/ossiarch/abilities.json uses. Activated abilities
// use `activate` (hooks.ts ActivatedAbilityHook, run by abilities.ts); passive rules are descriptors a code hook gates. What each hook needs:
//
//  ossiarchRelentlessDiscipline (BT-2)  ONE hook behind three battle-trait descriptors, one per phase window: movement (params.window
//        'moveDeclared': offered when a unit has declared its move, the target is that unit), charge (params.window 'phaseStart': the
//        'chargeStart' window, any friendly unit) and combat (phase fight / any, modes wound | ward). The descriptors carry UNLIMITED and no
//        limit: the hook enforces "once per phase for the army" itself with the phase marks `obr:rd:<player>:<unitId>` (one per use).
//        Resolve rolls the discipline roll (D6, +1 wholly within params.range of the general, +1 Immaculate Generalship, +1 Morghast Heralds
//        of Nagash while not wholly within range of the general) and on params.succeedOn+ grants the phase's effect for the rest of the phase.
//  ossiarchPeerlessCohesion (RA-1)      marker: the youDeclared reaction is never offered by the loop. `ossiarchRelentlessDiscipline` reads
//        the player's regimentAbilityId: a second use in the same phase (on another unit) while Peerless Cohesion has no use this turn in
//        players[p].abilityUses; the second use pushes that ledger entry.
//  Immaculate Generalship (RA-2), Heralds of Nagash (BT-1, AB-5) are plain descriptors read by the hook above; Dread Descent is the reserve
//        arrival the engine runs from the descriptor params; Soulbound Protectors (AB-2) reuses nighthauntDrawnToWar; Lode of Saturation
//        (ENH-3) is a declarative attacker-scope effect.
//  ossiarchRefinedCreations (AB-1)      a Spell (castingValue 5, rolled by abilities.ts); target = a visible friendly unit wholly within
//        params.range of the caster (the caster counts); Crit (2 Hits) on its melee weapons until the start of your next turn.
//  ossiarchSwitchAspects (AB-3/4)       any combat phase; modes parry | destroyer. Parry = an attacker-scope -1 to hit effect for the turn.
//        Destroyer = a marker effect for the turn plus the phase mark `obr:destroyer:<unitId>`; `forbidsWard` (F16 C1) answers true for the
//        marked unit's combat attacks.
//  ossiarchShardStorm / ossiarchMendConstructs (ENH-1/2)  Spells on the general (castingValue in data); see the target functions.
//  ossiarchHelmOfTyranny (ENH-4)        end of your turn, oncePerBattle, declared roll D6 3+ in data; marker effect for the turn, `produce` at
//        onObjectiveControl subtracts params.control from the marked unit's control score (the end-of-turn check runs before effects expire).
//
//  AI hints: ossiarchAbilityTiming / ossiarchTargetBonus / ossiarchModeBonus below are read by src/ai/utility.ts.
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { DiceExpr, Effect } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { EPS } from '../geometry'
import { rollSum } from '../dice'
import { effectService } from '../effects'
import { readDeclaredMove } from '../declared'
import { losService } from '../los'
import { modelStats } from '../state'
import {
  announce, enemiesInCombat, healUnit, inCombat, inflictMortal, isDamaged, liveModels, liveObjectives, onBoard, paramOf, unitContestsObjective, unitGap,
  whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const CODE_RD = 'ossiarchRelentlessDiscipline'
const CODE_PC = 'ossiarchPeerlessCohesion'
const CODE_REFINED = 'ossiarchRefinedCreations'
const CODE_ASPECTS = 'ossiarchSwitchAspects'
const CODE_SHARD = 'ossiarchShardStorm'
const CODE_MEND = 'ossiarchMendConstructs'
const CODE_HELM = 'ossiarchHelmOfTyranny'
const AB_HERALDS = 'ossiarch.ability.morghast-heralds'
const AB_IMMACULATE = 'ossiarch.ability.immaculate-generalship'

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const boardUnits = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const damagePoints = (state: GameState, unitId: UnitId): number =>
  liveModels(state, unitId).reduce((a, m) => a + Math.max(0, modelStats(state, m).W - m.woundsRemaining), 0)
const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}
// abilities.ts hands `targets` the player too (army abilities have no unit to read it from)
type TargetsFn = (state: GameState, unitId: UnitId | null, player?: PlayerId) => UnitId[]
type ModesFn = (state: GameState, unitId: UnitId | null, player: PlayerId) => { id: string; label: string }[]

const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}
const hasAbility = (state: GameState, unitId: UnitId, abilityId: string): boolean =>
  (state.datasheets[state.units[unitId]?.datasheetId ?? '']?.abilities ?? []).includes(abilityId)

// ---------- OBR-BT-2 Relentless Discipline ----------
const rdPrefix = (p: PlayerId): string => `obr:rd:${p}:`
const rdUsed = (state: GameState, p: PlayerId): UnitId[] =>
  state.phaseState.marks.filter((m) => m.startsWith(rdPrefix(p))).map((m) => m.slice(rdPrefix(p).length))

// the player's regiment ability is Peerless Cohesion and it has not been used this turn
function peerlessReady(state: GameState, p: PlayerId): boolean {
  const reg = state.players[p]?.regimentAbilityId
  if (!reg || state.abilities[reg]?.code !== CODE_PC) return false
  return !state.players[p].abilityUses.some((u) => u.abilityId === reg && u.round === state.round && u.turn === state.activePlayer)
}
// once per phase for the army; Peerless Cohesion adds one more per turn (OBR-RA-1)
const rdAllowed = (state: GameState, p: PlayerId): boolean => {
  const n = rdUsed(state, p).length
  return n === 0 || (n === 1 && peerlessReady(state, p))
}

const rdTargets: TargetsFn = (state, _unitId, player) => {
  const p = player ?? state.activePlayer
  if (!rdAllowed(state, p)) return []
  const used = rdUsed(state, p)
  if (state.phase === 'movement') {
    // offered the moment a unit has declared its move: that unit is the target
    const d = readDeclaredMove(state)
    const u = d ? onBoard(state, d.unitId) : null
    return u && u.player === p && d!.moveType !== 'stationary' && !used.includes(u.id) ? [u.id] : []
  }
  return boardUnits(state, p).filter((id) => !used.includes(id))
}

// the discipline roll's modifiers, in the order the spec lists them
export function disciplineBonus(state: GameState, player: PlayerId, targetId: UnitId): number {
  const reg = state.players[player]?.regimentAbilityId
  const general = generalOf(state, player)
  const range = num(Object.values(state.abilities).find((a) => a.code === CODE_RD)?.params?.range, 12)
  const nearGeneral = !!general && (general === targetId || whollyWithinUnit(state, targetId, general, range))
  let bonus = 0
  if (nearGeneral) bonus += 1
  if (reg === AB_IMMACULATE) bonus += 1
  if (hasAbility(state, targetId, AB_HERALDS) && !nearGeneral) bonus += 1
  return bonus
}

const rdModes: ModesFn = (state) => state.phase === 'fight'
  ? [{ id: 'wound', label: 'Cruel Edge: +1 to wound rolls for its combat attacks' }, { id: 'ward', label: 'Unyielding Bones: Ward (5+)' }]
  : []

const rdActivate: ActivatedAbilityHook & { targets: TargetsFn; modesFor: ModesFn } = {
  canUse: (state, _unitId, use) => pickedOk(rdTargets(state, null, use.player), use),
  targets: rdTargets,
  modesFor: rdModes,
  resolve(ctx, use) {
    const s = ctx.state
    const p = use.player
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const name = s.units[target].name
    // a second use in the phase is Peerless Cohesion's (once per turn)
    if (rdUsed(s, p).length >= 1) {
      const reg = s.players[p].regimentAbilityId
      if (reg) s.players[p].abilityUses.push({ abilityId: reg, unitId: null, round: s.round, turn: s.activePlayer, phase: s.phase })
    }
    s.phaseState.marks.push(rdPrefix(p) + target)
    const die = ctx.rollExpr('D6', { purpose: 'ability', player: p, targetUnitId: target, commandRerollable: false }).total
    const bonus = disciplineBonus(s, p, target)
    const total = die + bonus
    const need = num(paramOf(s, use.abilityId, 'succeedOn', 4), 4)
    const roll = `discipline roll ${die}${bonus ? ` + ${bonus} = ${total}` : ''}`
    if (total < need) {
      announce(ctx, use, target, `Relentless Discipline: ${roll}, ${name} is not driven on`)
      return
    }
    const sourceAbilityId = use.abilityId
    const grant = (effect: Effect): void => {
      effectService.grant(ctx, target, effect, { sourceAbilityId, sourceUnitId: target, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    }
    if (s.phase === 'movement') {
      const m = num(paramOf(s, use.abilityId, 'move', 2), 2)
      grant({ modifyStat: { stat: 'M', value: m } })
      announce(ctx, use, target, `Relentless Discipline: ${roll}, ${name} adds ${m}" to its Move for the phase`)
    } else if (s.phase === 'charge') {
      const c = num(paramOf(s, use.abilityId, 'charge', 1), 1)
      grant({ modifyRoll: { roll: 'charge', value: c } })
      announce(ctx, use, target, `Relentless Discipline: ${roll}, ${name} adds ${c} to its charge rolls for the phase`)
    } else if (use.modeId === 'ward') {
      const w = num(paramOf(s, use.abilityId, 'ward', 5), 5)
      grant({ feelNoPain: w as 2 | 3 | 4 | 5 | 6 })
      announce(ctx, use, target, `Relentless Discipline: ${roll}, ${name} has Ward (${w}+) for the phase`)
    } else {
      const wd = num(paramOf(s, use.abilityId, 'wound', 1), 1)
      grant({ when: { weaponType: 'melee' }, modifyRoll: { roll: 'wound', value: wd } })
      announce(ctx, use, target, `Relentless Discipline: ${roll}, ${name} adds ${wd} to the wound rolls of its combat attacks for the phase`)
    }
  },
}
const ossiarchRelentlessDiscipline: EngineCodeHook = { name: CODE_RD, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: rdActivate }

// ---------- OBR-RA-1 Peerless Cohesion ----------
// a marker: its reaction is never offered (abilities.ts only knows core.move / ATTACK reactions); Relentless Discipline reads the ledger
const ossiarchPeerlessCohesion: EngineCodeHook = {
  name: CODE_PC, kind: 'ability', hook: 'onAbilityDeclared', run: noop,
  activate: { canUse: () => false, resolve: noop },
}

// ---------- OBR-AB-1 Refined Creations ----------
const casterRange = (state: GameState, unitId: UnitId | null, code: string, fallback: number): number => {
  const unit = unitId ? state.units[unitId] : undefined
  const ab = Object.values(state.abilities).find((a) => a.code === code && (a.source !== 'enhancement' || (unit && unit.models.includes(a.bearerModelId as string))))
  return num(ab?.params?.range, fallback)
}
const sees = (state: GameState, from: UnitId, to: UnitId): boolean => liveModels(state, from).some((m) => losService.unitVisible(state, m.id, to))

const refinedTargets: TargetsFn = (state, unitId) => {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = casterRange(state, me.id, CODE_REFINED, 12)
  return boardUnits(state, me.player).filter((id) => id === me.id || (whollyWithinUnit(state, id, me.id, range) && sees(state, me.id, id)))
}
const refinedActivate: ActivatedAbilityHook & { targets: TargetsFn } = {
  canUse: (state, unitId, use) => pickedOk(refinedTargets(state, unitId), use),
  targets: refinedTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    effectService.grant(ctx, target, { when: { weaponType: 'melee' }, grantWeaponAbility: { ability: 'CRIT_2_HITS' } }, {
      sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn',
    })
    announce(ctx, use, target, `Refined Creations: the melee weapons of ${ctx.state.units[target].name} have Crit (2 Hits) until the start of your next turn`)
  },
}
const ossiarchRefinedCreations: EngineCodeHook = { name: CODE_REFINED, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: refinedActivate }

// ---------- OBR-AB-3/4 Switch Aspects ----------
const destroyerMark = (unitId: UnitId): string => `obr:destroyer:${unitId}`

const aspectsActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId),
  resolve(ctx, use) {
    const s = ctx.state
    const me = onBoard(s, use.unitId)
    if (!me) return
    if (use.modeId === 'destroyer') {
      // a marker effect so the unit is a hook source for the turn; the phase mark says the Destroyer Aspect is the one chosen
      effectService.grant(ctx, me.id, {}, { sourceAbilityId: use.abilityId, sourceUnitId: me.id, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
      if (!s.phaseState.marks.includes(destroyerMark(me.id))) s.phaseState.marks.push(destroyerMark(me.id))
      announce(ctx, use, null, `Switch Aspects: Destroyer Aspect, no ward rolls against the combat attacks of ${me.name} this turn`)
    } else {
      // scope 'attacker' flips the side: the holder is the unit being attacked, the modified roll is the attacker's
      effectService.grant(ctx, me.id, { when: { weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: -1 } }, {
        sourceAbilityId: use.abilityId, sourceUnitId: me.id, scope: { who: 'attacker' }, duration: 'untilEndOfTurn',
      })
      announce(ctx, use, null, `Switch Aspects: Blade-parry Aspect, combat attacks against ${me.name} get -1 to hit this turn`)
    }
  },
}
const ossiarchSwitchAspects: EngineCodeHook = {
  name: CODE_ASPECTS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: aspectsActivate,
  // the Destroyer Aspect: the unit's combat attacks (normal and Crit (Mortal) damage) allow no ward rolls this turn
  forbidsWard(state, entry, info) {
    return !!entry.active && info.kind === 'melee' && entry.holderUnitId === info.attackerUnitId && state.phaseState.marks.includes(destroyerMark(entry.holderUnitId))
  },
}

// ---------- OBR-ENH-1 Shard Storm ----------
const shardTargets: TargetsFn = (state, unitId) => {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = casterRange(state, me.id, CODE_SHARD, 12)
  return boardUnits(state, other(me.player)).filter((id) => unitGap(state, me.id, id) <= range + EPS && sees(state, me.id, id))
}
const shardActivate: ActivatedAbilityHook & { targets: TargetsFn } = {
  canUse: (state, unitId, use) => pickedOk(shardTargets(state, unitId), use),
  targets: shardTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const models = liveModels(s, target).length
    if (models <= 0) return
    const need = num(paramOf(s, use.abilityId, 'succeedOn', 5), 5)
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: models, mode: 'perDie', unitId: use.unitId, targetUnitId: target, commandRerollable: false })
    const hits = roll.final.filter((d) => d >= need).length
    announce(ctx, use, target, `Shard Storm: ${models} dice against ${s.units[target].name}, ${hits} mortal damage`)
    inflictMortal(ctx, use, target, hits)
  },
}
const ossiarchShardStorm: EngineCodeHook = { name: CODE_SHARD, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: shardActivate }

// ---------- OBR-ENH-2 Mend Constructs ----------
const mendTargets: TargetsFn = (state, unitId) => {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = casterRange(state, me.id, CODE_MEND, 12)
  return boardUnits(state, me.player).filter((id) => isDamaged(state, id) && (id === me.id || whollyWithinUnit(state, id, me.id, range)) && (id === me.id || sees(state, me.id, id)))
}
const mendActivate: ActivatedAbilityHook & { targets: TargetsFn } = {
  canUse: (state, unitId, use) => pickedOk(mendTargets(state, unitId), use),
  targets: mendTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const amount = ctx.rollExpr(paramOf<DiceExpr>(ctx.state, use.abilityId, 'heal', 'D3'), { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
    const healed = healUnit(ctx, target, amount, use.abilityId)
    announce(ctx, use, target, `Mend Constructs: Heal (${amount}), ${healed} damage removed from ${ctx.state.units[target].name}`)
  },
}
const ossiarchMendConstructs: EngineCodeHook = { name: CODE_MEND, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: mendActivate }

// ---------- OBR-ENH-4 Helm of Tyranny ----------
const helmTargets: TargetsFn = (state, unitId) => {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = casterRange(state, me.id, CODE_HELM, 12)
  return boardUnits(state, other(me.player)).filter((id) => unitGap(state, me.id, id) <= range + EPS)
}
const helmActivate: ActivatedAbilityHook & { targets: TargetsFn } = {
  canUse: (state, unitId, use) => pickedOk(helmTargets(state, unitId), use),
  targets: helmTargets,
  resolve(ctx, use) {
    // abilities.ts rolled the D6 3+ declared in the data and only calls this on success
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    effectService.grant(ctx, target, {}, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Helm of Tyranny: ${ctx.state.units[target].name} has -${num(paramOf(ctx.state, use.abilityId, 'control', 3), 3)} to its control score for the rest of the turn`)
  },
}
const ossiarchHelmOfTyranny: EngineCodeHook = {
  name: CODE_HELM, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: helmActivate,
  producesAt: ['onObjectiveControl'],
  produce(_ctx, entry, data) {
    if (!entry.active || data.contestingUnitId !== entry.holderUnitId) return null
    return { kind: 'stat', delta: -num(entry.params.control, 3) }
  },
}

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus / abilityModeBonus; null = no opinion) ----------
const meleeAttacks = (state: GameState, unitId: UnitId): number => {
  let n = 0
  for (const m of liveModels(state, unitId)) {
    for (const w of m.weapons) {
      const wp = state.weapons[w]
      if (wp && wp.kind === 'melee') n += typeof wp.A === 'number' ? wp.A : 3
    }
  }
  return n
}
const centre = (state: GameState, unitId: UnitId): { x: number; z: number } | null => {
  const ms = liveModels(state, unitId)
  if (ms.length === 0) return null
  return { x: ms.reduce((a, m) => a + m.pos.x, 0) / ms.length, z: ms.reduce((a, m) => a + m.pos.z, 0) / ms.length }
}
const nearestEnemyGap = (state: GameState, unitId: UnitId): number => {
  const me = state.units[unitId]
  if (!me) return Infinity
  return Math.min(Infinity, ...boardUnits(state, other(me.player)).map((e) => unitGap(state, unitId, e)))
}
const moveOf = (state: GameState, unitId: UnitId): number => Math.max(0, ...liveModels(state, unitId).map((m) => modelStats(state, m).M))
// the nearest objective this player does not already control, from the unit's centre
const nearestObjectiveDistance = (state: GameState, unitId: UnitId): number => {
  const me = state.units[unitId]
  const c = centre(state, unitId)
  if (!me || !c) return Infinity
  let best = Infinity
  for (const o of liveObjectives(state)) {
    if (o.controller === me.player || unitContestsObjective(state, unitId, o)) continue
    best = Math.min(best, Math.hypot(o.pos.x - c.x, o.pos.z - c.z))
  }
  return best
}
// P(2D6 >= n)
const twoDiceAtLeast = (n: number): number => {
  if (n <= 2) return 1
  if (n > 12) return 0
  let ways = 0
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= n) ways++
  return ways / 36
}
// how much +1 to the charge roll adds to the unit's best charge: the chance gain times a rough size of the blow
function chargeGain(state: GameState, unitId: UnitId): number {
  const me = state.units[unitId]
  if (!me || me.location !== 'board' || inCombat(state, unitId) || meleeAttacks(state, unitId) <= 0) return 0
  let best = 0
  for (const e of boardUnits(state, other(me.player))) {
    const gap = unitGap(state, unitId, e)
    const need = Math.ceil(Math.max(0, gap - 0.5))
    if (need < 2 || need > 12) continue
    const gain = twoDiceAtLeast(need - 1) - twoDiceAtLeast(need)
    best = Math.max(best, gain * (2 + meleeAttacks(state, unitId) * 0.4))
  }
  return best
}

// the enemy units a unit is in combat with that carry a printed ward
const wardedEnemiesInCombat = (state: GameState, unitId: UnitId): number =>
  enemiesInCombat(state, unitId).filter((e) => typeof state.datasheets[state.units[e].datasheetId]?.stats.ward === 'number').length

// the enemy melee attacks aimed at a unit (everything in combat with it)
const incomingAttacks = (state: GameState, unitId: UnitId): number => enemiesInCombat(state, unitId).reduce((a, e) => a + meleeAttacks(state, e), 0)

// a friendly unit and an enemy unit both stand on an objective the enemy unit is contesting (Helm of Tyranny can swing it)
function contestedBy(state: GameState, player: PlayerId, enemyId: UnitId): number {
  let n = 0
  for (const o of liveObjectives(state)) {
    if (!unitContestsObjective(state, enemyId, o)) continue
    n += 1
    if (boardUnits(state, player).some((id) => unitContestsObjective(state, id, o))) n += 1
  }
  return n
}

// below -2 the bot passes instead of using the ability
export function ossiarchAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  switch (code) {
    case CODE_RD: {
      if (state.phase === 'movement') {
        const d = readDeclaredMove(state)
        const u = d ? onBoard(state, d.unitId) : null
        if (!d || !u || d.moveType === 'fallBack' || inCombat(state, u.id)) return -3
        // worth it when the extra 2" brings an objective or an enemy into reach this turn that the plain Move would not
        const m = moveOf(state, u.id) + (d.moveType === 'advance' ? 3.5 : 0)
        const toEnemy = nearestEnemyGap(state, u.id)
        const toObjective = nearestObjectiveDistance(state, u.id)
        return Math.min(toEnemy, toObjective) > m - 0.01 && Math.min(toEnemy, toObjective) < m + 24 ? 0 : -3
      }
      if (state.phase === 'charge') {
        const best = Math.max(0, ...boardUnits(state, player).map((id) => chargeGain(state, id)))
        return best >= 0.15 ? 0 : -3
      }
      // combat: some friendly unit is in combat right now
      return boardUnits(state, player).some((id) => inCombat(state, id)) ? 0 : -3
    }
    case CODE_ASPECTS:
      return unitId && inCombat(state, unitId) ? 0 : -3
    case CODE_REFINED:
      return 0
    case CODE_SHARD: {
      // a crowd: each model is a die at 5+; the best target in range, casting is 7+
      const targets = unitId ? shardTargets(state, unitId) : []
      const most = Math.max(0, ...targets.map((id) => liveModels(state, id).length))
      return most >= 6 ? 1 : most >= 4 ? 0 : -3
    }
    case CODE_MEND: {
      const targets = unitId ? mendTargets(state, unitId) : []
      const most = Math.max(0, ...targets.map((id) => damagePoints(state, id)))
      return most >= 3 ? 1 : most >= 2 ? 0 : -3
    }
    case CODE_HELM: {
      // once per battle: wait for an enemy unit on an objective we also stand on (or the last rounds, any objective holder)
      const targets = unitId ? helmTargets(state, unitId) : []
      const best = Math.max(0, ...targets.map((id) => contestedBy(state, player, id)))
      if (best >= 2) return 0
      return state.round >= 4 && best >= 1 ? 0 : -3
    }
    default:
      return null
  }
}

export function ossiarchTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_RD: {
      if (state.phase === 'charge') return chargeGain(state, unitId) * 8
      if (state.phase === 'fight') {
        // the unit with the most swings in combat; the Ossifector and the Morghast roll best
        const swings = meleeAttacks(state, unitId)
        return (inCombat(state, unitId) ? 3 : -2) + swings * 0.15 + incomingAttacks(state, unitId) * 0.1
      }
      return 0
    }
    case CODE_REFINED: {
      // Morghast and Stalkers in or near combat first, then the Guard (the weapons that swing hardest with the most to gain from Crit)
      const near = nearestEnemyGap(state, unitId)
      const reach = inCombat(state, unitId) ? 3 : near <= moveOf(state, unitId) + 12 ? 1.5 : 0
      return reach + meleeAttacks(state, unitId) * 0.25
    }
    case CODE_SHARD:
      return liveModels(state, unitId).length * 0.6
    case CODE_MEND:
      return damagePoints(state, unitId) * 0.5
    case CODE_HELM:
      return contestedBy(state, player, unitId) * 2
    default:
      return null
  }
}

// Relentless Discipline (combat): Ward when the unit takes more swings than it makes, else +1 to wound. Switch Aspects: Destroyer
// against a warded enemy, else Blade-parry.
export function ossiarchModeBonus(state: GameState, code: string, unitId: UnitId | null, optionId: string, target: UnitId | null): number | null {
  if (code === CODE_RD) {
    if (!target || !state.units[target]) return optionId === 'wound' ? 0.1 : 0
    const defend = incomingAttacks(state, target) > meleeAttacks(state, target) * 1.25
    return (optionId === 'ward') === defend ? 1 : 0
  }
  if (code === CODE_ASPECTS) {
    if (!unitId || !state.units[unitId]) return optionId === 'destroyer' ? 0.1 : 0
    const warded = wardedEnemiesInCombat(state, unitId) > 0
    return (optionId === 'destroyer') === warded ? 1 : 0
  }
  return null
}

export const ossiarchHooks: Record<string, EngineCodeHook> = {
  ossiarchRelentlessDiscipline, ossiarchPeerlessCohesion, ossiarchRefinedCreations, ossiarchSwitchAspects, ossiarchShardStorm,
  ossiarchMendConstructs, ossiarchHelmOfTyranny,
}
