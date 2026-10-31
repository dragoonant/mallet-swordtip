// Daughters of Khaine (Heartflayer Troupe) code hooks: docs/spec/factions/daughters-of-khaine.md (DOK-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/daughters/abilities.json uses. What each hook
// needs from data:
//
//  daughtersBloodRites (BT-1..5)        passive; the descriptor's four modifyRoll effects (run, charge, melee hit, melee wound: +1 each)
//        are switched on by `gate`, which reads which roll is being asked about from the hook data: the roller must be the holder and the
//        army's rite level (bloodRiteLevel) must reach params[kind] (advance 1, charge 2, hit 3, wound 4). `resourceReadout` shows the
//        level in the HUD.
//  daughtersMurderousEpiphany (RA-1)    hero phase, oncePerBattle, only in battle rounds 1-3. Writes the round into the ledger
//        mission.custom.dokEpiphany[player]; bloodRiteLevel then reads max(round, used round + 1).
//  daughtersBlessingOfKhaine (RA-2)     any combat phase, oncePerTurnArmy; target = a friendly unit wholly within params.range of the
//        general (not the general); grants params.grant (+1 to ward rolls) until the end of the phase.
//  daughtersAllOutSlaughter (AB-1)      hero phase; target = another friendly unit wholly within params.range of this unit; grants
//        params.grant (+1 Attacks to melee weapons) until the end of the turn. Companion weapons are skipped by the engine (CORE-12.4).
//  daughtersTurnedToCrystal (AB-2)      end of any turn, oncePerTurn; abilities.ts rolls the declared D6 (2+) and calls resolve on a
//        success: 1 mortal damage on an enemy unit within params.range.
//  daughtersHeartseekers (AB-3)         descriptor { ranged, lethalOn 5 }; the gate closes once the unit has used a Move ability this turn.
//  daughtersDoomfire (AB-4)             a Spell (castingValue in data, abilities.ts rolls it; the datasheet's castingLevel lets a
//        non-Wizard cast); target = a visible enemy unit within params.range; params.damage mortal damage.
//  daughtersBathedInBlood (ENH-1)       passive; onEnemyModelSlain heals the bearer's unit by params.heal for every enemy model it slays.
//  daughtersFlaskOfShademist (ENH-3)    any combat phase, oncePerBattle; grants every friendly unit a -1 to hit against attacks that
//        target it (scope attacker); `gateActive` keeps it live only while the unit is wholly within params.range of the general.
//  daughtersZealousOrator (ENH-4)       hero phase; target = a friendly unit wholly within params.range of the general, out of combat,
//        with slain models; one D6 per slain model, each params.succeedOn+ returns one.
//  Frenzied Fervour (AB-5), Fuelled by Revenge (ENH-2) and the weapon abilities are data only.
//
//  AI hints: daughtersAbilityTiming / daughtersTargetBonus below are read by src/ai/utility.ts (abilityTiming / abilityTargetBonus).
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook, FactionResource } from '../code-hooks'
import type { DiceExpr, Effect } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { EPS } from '../geometry'
import { diceExprMean } from '../dice'
import { effectService } from '../effects'
import { losService } from '../los'
import { boardUnitsOf, datasheetOf, modelStats } from '../state'
import { weaponService } from '../weapons'
import {
  announce, enemiesInCombat, hasKeyword as unitHasKeyword, healUnit, inCombat, inflictMortal, liveModels, onBoard, paramOf, paramsByCode, returnSlainModels, returnableModels, unitGap, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

const CODE_RITES = 'daughtersBloodRites'
const CODE_EPIPHANY = 'daughtersMurderousEpiphany'
const CODE_BLESSING = 'daughtersBlessingOfKhaine'
const CODE_SLAUGHTER = 'daughtersAllOutSlaughter'
const CODE_CRYSTAL = 'daughtersTurnedToCrystal'
const CODE_SEEKERS = 'daughtersHeartseekers'
const CODE_DOOMFIRE = 'daughtersDoomfire'
const CODE_BLOOD = 'daughtersBathedInBlood'
const CODE_FLASK = 'daughtersFlaskOfShademist'
const CODE_ORATOR = 'daughtersZealousOrator'

const LEDGER = 'dokEpiphany'

const unitsOf = (state: GameState, player: PlayerId): UnitId[] => boardUnitsOf(state, player).map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const playerOf = (state: GameState, use: { player?: PlayerId }): PlayerId => use.player ?? state.activePlayer
const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}
const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}

// ---------- the rite level (DOK-BT-1, DOK-RA-1) ----------
/** the battle round in which the player used Murderous Epiphany (0 = not used) */
export function epiphanyRound(state: GameState, player: PlayerId): number {
  return ((state.mission.custom[LEDGER] as Partial<Record<PlayerId, number>> | undefined) ?? {})[player] ?? 0
}

/** the highest Blood Rite the player's army holds: the battle round, or the round after an Epiphany used in it; at most 4 */
export function bloodRiteLevel(state: GameState, player: PlayerId): number {
  const epi = epiphanyRound(state, player)
  return Math.min(4, Math.max(state.round, epi > 0 ? epi + 1 : 0))
}

const RITE_NAMES = ["Quickening Bloodlust (+1 run)", 'Headlong Fury (+1 charge)', "Zealot's Rage (+1 melee hit)", "Slaughterer's Strength (+1 melee wound)"]

type RiteRoll = 'advance' | 'charge' | 'hit' | 'wound'

// which of the descriptor's four effects the engine is asking about, and for which unit (read from the hook data)
function riteQuery(data: Record<string, unknown> | undefined): { kind: RiteRoll; unitId: UnitId } | null {
  if (!data) return null
  const roll = data.roll as { purpose?: string } | null | undefined
  const attack = data.attack as { attackerUnitId?: UnitId } | null | undefined
  if (attack && roll) {
    if (roll.purpose === 'hit' && attack.attackerUnitId) return { kind: 'hit', unitId: attack.attackerUnitId }
    if (roll.purpose === 'wound' && attack.attackerUnitId) return { kind: 'wound', unitId: attack.attackerUnitId }
    return null
  }
  if (typeof data.chargingUnitId === 'string') return { kind: 'charge', unitId: data.chargingUnitId }
  if (typeof data.movingUnitId === 'string') return { kind: 'advance', unitId: data.movingUnitId }
  return null
}

const daughtersBloodRites: EngineCodeHook = {
  name: CODE_RITES, kind: 'ability', hook: 'onStatQuery', run: noop,
  gate(state, holder, entry, data) {
    const q = riteQuery(data)
    if (!q || q.unitId !== holder.id) return false
    return bloodRiteLevel(state, holder.player) >= num(entry.params[q.kind], 99)
  },
  resourceReadout(state, _ability, player): FactionResource | null {
    const level = bloodRiteLevel(state, player)
    const held = RITE_NAMES.slice(0, level)
    return {
      id: 'daughters.rites', label: 'Blood Rites', value: level, max: 4,
      help: held.length > 0 ? `Rites held: ${held.join('; ')}.` : 'No rite yet: Quickening Bloodlust arrives in battle round 1.',
    }
  },
}

// ---------- DOK-RA-1 Murderous Epiphany ----------
const epiphanyActivate: ActivatedAbilityHook = {
  canUse: (state) => state.round >= 1 && state.round <= 3,
  resolve(ctx, use) {
    const s = ctx.state
    const all = (s.mission.custom[LEDGER] as Partial<Record<PlayerId, number>> | undefined) ?? {}
    s.mission.custom = { ...s.mission.custom, [LEDGER]: { ...all, [use.player]: s.round } }
    const level = bloodRiteLevel(s, use.player)
    announce(ctx, use, null, `Murderous Epiphany: the whole army gains ${RITE_NAMES[level - 1]} now and keeps it`)
  },
}
const daughtersMurderousEpiphany: EngineCodeHook = { name: CODE_EPIPHANY, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: epiphanyActivate }

// ---------- DOK-RA-2 Blessing of Khaine / DOK-AB-1 All-Out Slaughter (one grant on a friendly unit) ----------
function grantHook(name: string, targetsOf: (state: GameState, unitId: UnitId | null, player?: PlayerId) => UnitId[], said: (unitName: string) => string): EngineCodeHook {
  const activate: ActivatedAbilityHook & { targets: typeof targetsOf } = {
    canUse: (state, unitId, use) => pickedOk(targetsOf(state, unitId, playerOf(state, use)), use),
    targets: targetsOf,
    resolve(ctx, use) {
      const s = ctx.state
      const ab = s.abilities[use.abilityId]
      const target = onBoard(s, use.targetUnitIds[0])
      if (!ab || !target) return
      effectService.grant(ctx, target.id, (ab.params?.grant ?? []) as Effect[], {
        sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: ab.duration ?? 'untilEndOfTurn',
      })
      announce(ctx, use, target.id, said(target.name))
    },
  }
  return { name, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate }
}

// friendly units other than the general that are wholly within range of it
function blessingTargets(state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] {
  const p = player ?? state.activePlayer
  const general = generalOf(state, p)
  if (!general) return []
  const reg = state.abilities[state.players[p]?.regimentAbilityId ?? '']
  const range = reg?.code === CODE_BLESSING ? num(reg.params?.range, 12) : 12
  return unitsOf(state, p).filter((id) => id !== general && whollyWithinUnit(state, id, general, range))
}
const daughtersBlessingOfKhaine = grantHook(CODE_BLESSING, blessingTargets, (n) => `Blessing of Khaine: ${n} adds 1 to its ward rolls for the rest of the phase`)

// another friendly unit wholly within range of the unit using the ability
function slaughterTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramsByCode(state, me.id, CODE_SLAUGHTER).range, 12)
  return unitsOf(state, me.player).filter((id) => id !== me.id && whollyWithinUnit(state, id, me.id, range))
}
const daughtersAllOutSlaughter = grantHook(CODE_SLAUGHTER, slaughterTargets, (n) => `All-Out Slaughter: the melee weapons of ${n} have +1 Attacks this turn`)

// ---------- DOK-AB-2 Turned to Crystal ----------
function crystalTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramsByCode(state, me.id, CODE_CRYSTAL).range, 1)
  return unitsOf(state, other(me.player)).filter((id) => unitGap(state, me.id, id) <= range + EPS)
}
const crystalActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(crystalTargets(state, unitId), use),
  targets: crystalTargets,
  // abilities.ts rolls the declared D6 and only calls resolve on the 2+
  resolve(ctx, use) {
    const target = onBoard(ctx.state, use.targetUnitIds[0])
    if (!target) return
    announce(ctx, use, target.id, `Turned to Crystal: ${target.name} suffers 1 mortal damage`)
    inflictMortal(ctx, use, target.id, 1)
  },
}
const daughtersTurnedToCrystal: EngineCodeHook = { name: CODE_CRYSTAL, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: crystalActivate }

// ---------- DOK-AB-3 Heartseekers ----------
// critical hits on 5+ (descriptor lethalOn 5) unless the unit has used a Move ability this turn (normal move, run, retreat, charge).
// UnitTurnState.moveType is null when never asked (the opponent's turn), which counts as standing still.
const daughtersHeartseekers: EngineCodeHook = {
  name: CODE_SEEKERS, kind: 'ability', hook: 'onStatQuery', run: noop,
  gate(_state, holder) {
    const t = holder.turn
    return !(t.moveType === 'normal' || t.moveType === 'advance' || t.moveType === 'fallBack' || t.chargedThisTurn)
  },
}

// ---------- DOK-AB-4 Doomfire ----------
function doomfireTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const mage = onBoard(state, unitId)
  if (!mage) return []
  const range = num(paramsByCode(state, mage.id, CODE_DOOMFIRE).range, 12)
  const mine = liveModels(state, mage.id)
  return unitsOf(state, other(mage.player))
    .filter((id) => unitGap(state, mage.id, id) <= range + EPS && mine.some((m) => losService.unitVisible(state, m.id, id)))
    .sort((a, b) => woundsLeft(state, a) - woundsLeft(state, b) || (a < b ? -1 : 1))
}
const doomfireActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(doomfireTargets(state, unitId), use),
  targets: doomfireTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const dmg = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'damage', 'D3'), { purpose: 'ability', player: use.player, unitId: target.id, commandRerollable: false }).total
    announce(ctx, use, target.id, `Doomfire: ${dmg} mortal damage on ${target.name}`)
    inflictMortal(ctx, use, target.id, dmg)
  },
}
const daughtersDoomfire: EngineCodeHook = { name: CODE_DOOMFIRE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: doomfireActivate }

// ---------- DOK-ENH-1 Bathed in Blood ----------
// attack.ts calls onEnemyModelSlain for every source held by the slaying unit (the general's unit), melee, ranged and mortal damage alike
const daughtersBathedInBlood: EngineCodeHook = {
  name: CODE_BLOOD, kind: 'ability', hook: 'onStatQuery', run: noop,
  onEnemyModelSlain(ctx, entry) {
    if (!onBoard(ctx.state, entry.holderUnitId)) return
    const healed = healUnit(ctx, entry.holderUnitId, num(entry.params.heal, 1), entry.source.id)
    if (healed > 0) ctx.emit({ type: 'AbilityTriggered', abilityId: entry.source.id, sourceUnitId: entry.holderUnitId, targetUnitId: entry.holderUnitId, summary: `Bathed in Blood: ${ctx.state.units[entry.holderUnitId].name} heals ${healed}`, player: ctx.state.units[entry.holderUnitId].player })
  },
}

// ---------- DOK-ENH-3 Flask of Shademist ----------
const flaskActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId),
  resolve(ctx, use) {
    const s = ctx.state
    const bearer = onBoard(s, use.unitId)
    if (!bearer) return
    // scope 'attacker' flips the side: the holder is the unit being attacked, the modified roll is the attacker's
    const effect: Effect = { modifyRoll: { roll: 'hit', value: -1 } }
    for (const id of unitsOf(s, bearer.player)) {
      effectService.grant(ctx, id, effect, { sourceAbilityId: use.abilityId, sourceUnitId: bearer.id, scope: { who: 'attacker' }, duration: 'untilEndOfPhase' })
    }
    announce(ctx, use, null, `Flask of Shademist: attacks against friendly units wholly within ${num(paramOf(s, use.abilityId, 'range', 12), 12)}" of ${bearer.name} get -1 to hit this phase`)
  },
}
const daughtersFlaskOfShademist: EngineCodeHook = {
  name: CODE_FLASK, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: flaskActivate,
  // checked at each attack: the general's own unit always counts, any other unit only while it is wholly within range of the general
  gateActive(state, entry) {
    const holder = state.units[entry.holderUnitId]
    if (!holder || holder.location !== 'board') return false
    const general = generalOf(state, holder.player)
    if (!general) return false
    return holder.id === general || whollyWithinUnit(state, holder.id, general, num(entry.params.range, 12))
  },
}

// ---------- DOK-ENH-4 Zealous Orator ----------
function oratorTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramsByCode(state, me.id, CODE_ORATOR).range, 9)
  return unitsOf(state, me.player).filter((id) => whollyWithinUnit(state, id, me.id, range) && !inCombat(state, id) && returnableModels(state, id) > 0)
}
const oratorActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(oratorTargets(state, unitId), use),
  targets: oratorTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const slain = returnableModels(s, target.id)
    if (slain <= 0) return
    const need = num(paramOf(s, use.abilityId, 'succeedOn', 5), 5)
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: slain, mode: 'perDie', unitId: target.id, commandRerollable: false })
    const wins = roll.dice.filter((d) => d >= need).length
    const back = wins > 0 ? returnSlainModels(ctx, target.id, wins, use.abilityId) : 0
    announce(ctx, use, target.id, `Zealous Orator: ${slain} dice for ${target.name}, ${wins} scored ${need}+, ${back} model${back === 1 ? '' : 's'} returned`)
  },
}
const daughtersZealousOrator: EngineCodeHook = { name: CODE_ORATOR, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: oratorActivate }

// ---------- a rough damage estimate for the AI hints (kept here so the engine does not import src/ai) ----------
const rollP = (target: number): number => Math.max(1 / 6, Math.min(5 / 6, (7 - target) / 6))

// expected damage `attackerId` deals to `targetId` with its weapons of these kinds (one full activation)
function estimateDamage(state: GameState, attackerId: UnitId, targetId: UnitId, kinds: ('ranged' | 'melee')[]): number {
  const defenders = liveModels(state, targetId)
  if (defenders.length === 0) return 0
  const dst = modelStats(state, defenders[0])
  let total = 0
  for (const m of liveModels(state, attackerId)) {
    for (const wid of m.weapons) {
      const w = weaponService.effectiveWeapon(state, m.id, wid)
      if (!w || !kinds.includes(w.kind)) continue
      const hits = diceExprMean(w.A) * (w.skill === null ? 1 : rollP(w.skill))
      const mortal = w.abilities.find((a) => a.ability === 'HIT_MORTAL')
      if (mortal) { total += hits * (mortal.value === undefined ? 1 : diceExprMean(mortal.value)); continue }
      const need = dst.Sv + w.rend
      const unsaved = dst.noSave || need > 6 ? 1 : 1 - rollP(need)
      let dmg = hits * rollP(w.wound) * unsaved * diceExprMean(w.D)
      if (dst.ward !== null) dmg *= 1 - rollP(dst.ward)
      total += dmg
    }
  }
  return total
}

const meleeThreat = (state: GameState, unitId: UnitId): number =>
  enemiesInCombat(state, unitId).reduce((n, e) => n + estimateDamage(state, e, unitId, ['melee']), 0)

const meleeAttacks = (state: GameState, unitId: UnitId): number =>
  liveModels(state, unitId).reduce((n, m) => n + m.weapons.reduce((a, w) => {
    const wp = state.weapons[w]
    return a + (wp && wp.kind === 'melee' && !wp.abilities.some((x) => x.ability === 'COMPANION') ? diceExprMean(wp.A) : 0)
  }, 0), 0)

// the gap to the nearest enemy unit (30 when there is none)
const nearestEnemyGap = (state: GameState, unitId: UnitId, player: PlayerId): number =>
  Math.min(30, ...unitsOf(state, other(player)).map((e) => unitGap(state, unitId, e)))

// a friendly unit that will fight this turn or soon: in combat, or an enemy within a charge's reach
const busy = (state: GameState, unitId: UnitId, player: PlayerId): boolean => inCombat(state, unitId) || nearestEnemyGap(state, unitId, player) <= 12.5

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus; null = no opinion) ----------
// below -2 the bot passes instead of using the ability. Ability-use options carry no unit hint, so general-bound abilities fall back to
// the army's general.
export function daughtersAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  switch (code) {
    case CODE_EPIPHANY: {
      // +1 hit (round 2) is the best rite to pull forward, then +1 wound (round 3); round 1 only gives a charge bonus, so wait
      if (state.round < 2 || state.round > 3) return -3
      return unitsOf(state, player).some((id) => busy(state, id, player)) ? 0 : -3
    }
    case CODE_BLESSING: {
      // the unit that is about to take a beating; the phase passes with nothing to protect otherwise
      return blessingTargets(state, null, player).some((id) => inCombat(state, id)) ? 0 : -3
    }
    case CODE_SLAUGHTER: {
      const me = unitId ?? generalOf(state, player)
      return me && slaughterTargets(state, me).some((id) => busy(state, id, player)) ? 0 : -3
    }
    case CODE_FLASK: {
      // once per battle: the phase two or more units around the general are in combat (one is enough in the last round)
      const general = unitId ?? generalOf(state, player)
      if (!general || !onBoard(state, general)) return -3
      const covered = unitsOf(state, player).filter((id) => (id === general || whollyWithinUnit(state, id, general, 12)) && inCombat(state, id)).length
      return covered >= 2 || (covered >= 1 && state.round >= 4) ? 0 : -3
    }
    default:
      return null
  }
}

// F17 balance: Heartseekers only works for Blood Stalkers that use no Move ability this turn. The extra bow damage (Crit (Auto-wound)
// on 5+ instead of 6) they keep by standing still this movement phase against the best enemy already in bow range; null when the unit
// has no Heartseekers or nothing is in range (src/ai/utility.ts scoreDeclareMove adds it to Remain Stationary).
export function daughtersStayBonus(state: GameState, player: PlayerId, unitId: UnitId): number | null {
  const unit = onBoard(state, unitId)
  if (!unit || unit.player !== player || inCombat(state, unitId)) return null
  const seekers = datasheetOf(state, unitId).abilities.some((id) => state.abilities[id]?.code === CODE_SEEKERS)
  if (!seekers) return null
  let best = 0
  for (const e of unitsOf(state, other(player))) {
    const defenders = liveModels(state, e)
    if (defenders.length === 0) continue
    const dst = modelStats(state, defenders[0])
    const gap = unitGap(state, unitId, e)
    let extra = 0
    for (const m of liveModels(state, unitId)) {
      for (const wid of m.weapons) {
        const w = weaponService.effectiveWeapon(state, m.id, wid)
        if (!w || w.kind !== 'ranged' || w.range < gap || w.skill === null) continue
        const autoWound = w.abilities.some((a) => a.ability === 'CRIT_AUTO_WOUND')
        // wounds per attack with crits on `c`+: non-crit hits roll to wound, crits auto-wound (or just wound like any hit)
        const per = (c: number): number => {
          const crit = (7 - c) / 6, hit = Math.max(crit, rollP(w.skill as number))
          return (hit - crit) * rollP(w.wound) + crit * (autoWound ? 1 : rollP(w.wound))
        }
        const need = dst.Sv + w.rend
        const unsaved = dst.noSave || need > 6 ? 1 : 1 - rollP(need)
        let dmg = diceExprMean(w.A) * (per(5) - per(6)) * unsaved * diceExprMean(w.D)
        if (dst.ward !== null) dmg *= 1 - rollP(dst.ward)
        extra += dmg
      }
    }
    best = Math.max(best, extra)
  }
  return best > 0 ? best : null
}

export function daughtersTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_BLESSING:
      // the friendly unit in the worst fight
      return meleeThreat(state, unitId) / Math.max(1, woundsLeft(state, unitId)) * 3 + (inCombat(state, unitId) ? 2 : 0)
    case CODE_SLAUGHTER: {
      // a Witch Aelves unit in combat or within charge reach (most models), else the Warlocks
      const swing = Math.min(4, meleeAttacks(state, unitId) * 0.15)
      return swing + (busy(state, unitId, player) ? 3 : 0) + (unitHasKeyword(state, unitId, 'REINFORCEMENTS') ? 0.5 : 0)
    }
    case CODE_DOOMFIRE: {
      // the enemy with the fewest wounds left (a kill), else the Hero
      const left = woundsLeft(state, unitId)
      return (left <= 2 ? 3 : 0) + Math.max(0, 8 - left) * 0.3 + (unitHasKeyword(state, unitId, 'HERO') ? 0.5 : 0)
    }
    case CODE_CRYSTAL:
      return Math.max(0, 6 - woundsLeft(state, unitId)) * 0.3
    case CODE_ORATOR:
      // the unit with the most slain models to bring back
      return returnableModels(state, unitId) * 0.7
    default:
      return null
  }
}

export const daughtersHooks: Record<string, EngineCodeHook> = {
  daughtersBloodRites, daughtersMurderousEpiphany, daughtersBlessingOfKhaine, daughtersAllOutSlaughter, daughtersTurnedToCrystal,
  daughtersHeartseekers, daughtersDoomfire, daughtersBathedInBlood, daughtersFlaskOfShademist, daughtersZealousOrator,
}
