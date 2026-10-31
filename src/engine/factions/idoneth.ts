// Idoneth Deepkin (Soulraid Hunt) code hooks: docs/spec/factions/idoneth-deepkin.md (IDK-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/idoneth/abilities.json uses. Most of the army is
// declarative data (Tides of Death's five round-gated effects, Low Tide, Way of the Cresting Wave, Steelshell Armour, Sweeping Blows,
// the weapon abilities). What the hooks need from data:
//
//  idonethTides (BT-1..4)             code on the main Tides of Death descriptor only for the HUD: `resourceReadout` shows the tide of the
//        current battle round. The effects themselves stay in the descriptor.
//  idonethEtherseaPredators (RA-2)    regiment ability, endOfTurn / any, oncePerTurnArmy, declare friendly unit, params.heal (D3). The same
//        hook's `onOwnFightResolved` (attack.ts, fires for the regiment ability's code on every fighting friendly unit) records the
//        unit in mission.custom.idkFought = { key: 'round:activePlayer', units } (a stale key reads as empty). Targets = damaged
//        friendly CAVALRY units on the battlefield that are in the current ledger.
//  idonethMindFlare (ENH-3)           enhancement, any combat phase, oncePerBattle, declare enemy unit. Targets = enemy units in combat
//        with the bearer's unit. Grants the target `onlySixes: 'hit'` (F16 C2, exact) until the end of the phase.
//  idonethDeliciousMorsels (ENH-4)    enhancement, your hero phase, no declare, params.range (3) / heal (1). Heal each damaged friendly
//        CAVALRY unit with a model within range of the bearer's unit.
//  idonethCreepingMist (AB-1)         your hero phase, declare friendly unit, params.range (12) / succeedOn (3). Target = a visible friendly
//        unit wholly within range of the caster (the caster counts). The hook rolls the D6 itself so Arch-Ritualist (the unit's
//        enhancementId) can add 1. Success: -1 to the wound rolls of attacks against the target until the start of the next turn
//        (a scope 'attacker' effect held by the target).
//  idonethBiovoltaicBlast (AB-2)      charge phase / any, oncePerBattle, declare enemy unit, params.within (1). canUse = the unit charged
//        this turn and an enemy is within range. One die per live model (+1 to every die when the target has more models); 4-5 = 1
//        mortal, 6+ = D3 mortal; the total is inflicted at once.
//  idonethBloodthirstyPredators (AB-3) passive, params.range (6) / attacks (1). `statDelta` gives the Allopex's Ferocious Bite +1 Attacks
//        while an enemy unit within range is damaged or lost a model this turn (attack.ts lostModelThisTurn, F16 C1).
//        affectsCompanion: the Bite is a Companion weapon and the ability names it.
//
//  AI hints: idonethAbilityTiming / idonethTargetBonus / idonethMoveThenCharge below are read by src/ai/utility.ts.
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook, FactionResource } from '../code-hooks'
import type { DiceExpr, Effect } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { EPS } from '../geometry'
import { effectService } from '../effects'
import { lostModelThisTurn } from '../attack'
import { losService } from '../los'
import { boardUnitsOf, modelStats } from '../state'
import { weaponService } from '../weapons'
import { diceExprMean } from '../dice'
import {
  announce, enemiesInCombat, hasKeyword, healUnit, inflictMortal, isDamaged, liveModels, onBoard, paramOf, paramsByCode, unitGap, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

const CODE_TIDES = 'idonethTides'
const CODE_PREDATORS = 'idonethEtherseaPredators'
const CODE_MIND = 'idonethMindFlare'
const CODE_MORSELS = 'idonethDeliciousMorsels'
const CODE_MIST = 'idonethCreepingMist'
const CODE_BLAST = 'idonethBiovoltaicBlast'
const CODE_BLOODTHIRSTY = 'idonethBloodthirstyPredators'

const ARCH_RITUALIST = 'idoneth.enh.arch-ritualist'
const BITE_ID = 'idoneth.weapon.allopex-bite'
const TIDES_ID = 'idoneth.ability.tides-of-death'
const FOUGHT = 'idkFought'

const unitsOf = (state: GameState, player: PlayerId): UnitId[] => boardUnitsOf(state, player).map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const playerOf = (state: GameState, use: { player?: PlayerId }): PlayerId => use.player ?? state.activePlayer
const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}
const seesUnit = (state: GameState, fromUnit: UnitId, target: UnitId): boolean => liveModels(state, fromUnit).some((m) => losService.unitVisible(state, m.id, target))
const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}

// ---------- IDK-BT Tides of Death: the HUD readout ----------
export const TIDES = ['Low Tide', 'Flood Tide', 'High Tide', 'Ebb Tide'] as const
const TIDE_HELP = [
  'Low Tide (round 1): shooting attacks against your units get -1 to hit.',
  'Flood Tide (round 2): your units can still shoot and charge after they Run.',
  'High Tide (round 3): your units have Strike-first.',
  'Ebb Tide (round 4): your units can still shoot and charge after they Retreat.',
]
/** the tide of the current battle round, 0 (Low) to 3 (Ebb); rounds past the fourth stay on Ebb Tide */
export const tideIndex = (state: GameState): number => Math.max(0, Math.min(3, state.round - 1))

const idonethTides: EngineCodeHook = {
  name: CODE_TIDES, kind: 'ability', hook: 'onStatQuery', run: noop,
  resourceReadout(state): FactionResource | null {
    const i = tideIndex(state)
    return { id: 'idoneth.tide', label: `Tide: ${TIDES[i]}`, value: i + 1, max: 4, help: TIDE_HELP[i] }
  },
}

/** AI hint: the unit's army has Tides of Death and the tide of this round lets a unit that made this kind of move still charge */
export function idonethMoveThenCharge(state: GameState, unitId: UnitId, moveType: string | null | undefined): boolean {
  const owner = state.units[unitId]?.player
  if (!owner || !state.players[owner]?.battleTraitIds.includes(TIDES_ID)) return false
  return (moveType === 'advance' && state.round === 2) || (moveType === 'fallBack' && state.round === 4)
}

// ---------- IDK-RA-2 Ethersea Predators ----------
interface FoughtLedger { key: string; units: UnitId[] }
const turnKey = (s: GameState): string => `${s.round}:${s.activePlayer}`
const foughtThisTurn = (s: GameState): UnitId[] => {
  const l = s.mission.custom[FOUGHT] as FoughtLedger | undefined
  return l && l.key === turnKey(s) ? l.units : []
}

function predatorTargets(state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] {
  const fought = foughtThisTurn(state)
  return unitsOf(state, player ?? state.activePlayer).filter((id) => fought.includes(id) && hasKeyword(state, id, 'CAVALRY') && isDamaged(state, id))
}

const predatorActivate: ActivatedAbilityHook & { targets: typeof predatorTargets } = {
  canUse: (state, unitId, use) => pickedOk(predatorTargets(state, unitId, playerOf(state, use)), use),
  targets: predatorTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const n = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'heal', 'D3'), { purpose: 'ability', player: use.player, unitId: target.id, commandRerollable: false }).total
    const healed = healUnit(ctx, target.id, n, use.abilityId)
    announce(ctx, use, target.id, `Ethersea Predators: Heal (${n}), ${healed} damage removed from ${target.name}`)
  },
}

const idonethEtherseaPredators: EngineCodeHook = {
  name: CODE_PREDATORS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: predatorActivate,
  onOwnFightResolved(ctx, { unitId }) {
    const s = ctx.state
    const now = foughtThisTurn(s)
    if (now.includes(unitId)) return
    s.mission.custom = { ...s.mission.custom, [FOUGHT]: { key: turnKey(s), units: [...now, unitId] } satisfies FoughtLedger }
  },
}

// ---------- IDK-ENH-3 Mind Flare ----------
const mindTargets = (state: GameState, unitId: UnitId | null): UnitId[] => (unitId ? enemiesInCombat(state, unitId) : [])

const mindActivate: ActivatedAbilityHook & { targets: typeof mindTargets } = {
  canUse: (state, unitId, use) => !!onBoard(state, unitId) && pickedOk(mindTargets(state, unitId), use),
  targets: mindTargets,
  resolve(ctx, use) {
    const target = onBoard(ctx.state, use.targetUnitIds[0])
    if (!target) return
    // the holder is the enemy unit and the effect changes its own hit rolls: an unmodified 6 hits, anything else misses
    const effect: Effect = { onlySixes: 'hit' }
    effectService.grant(ctx, target.id, effect, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    announce(ctx, use, target.id, `Mind Flare: the attacks of ${target.name} only hit on an unmodified 6 this phase`)
  },
}
const idonethMindFlare: EngineCodeHook = { name: CODE_MIND, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: mindActivate }

// ---------- IDK-ENH-4 Delicious Morsels ----------
function morselTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramsByCode(state, me.id, CODE_MORSELS).range, 3)
  return unitsOf(state, me.player).filter((id) => hasKeyword(state, id, 'CAVALRY') && isDamaged(state, id) && unitGap(state, id, me.id) <= range + EPS)
}

const morselActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => morselTargets(state, unitId).length > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const amount = num(paramOf(s, use.abilityId, 'heal', 1), 1)
    let total = 0
    for (const id of morselTargets(s, use.unitId)) total += healUnit(ctx, id, amount, use.abilityId)
    announce(ctx, use, null, `Delicious Morsels: ${total} damage healed on the Cavalry around the general`)
  },
}
const idonethDeliciousMorsels: EngineCodeHook = { name: CODE_MORSELS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: morselActivate }

// ---------- IDK-AB-1 Ritual of the Creeping Mist ----------
function mistTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramsByCode(state, me.id, CODE_MIST).range, 12)
  return unitsOf(state, me.player).filter((id) => id === me.id || (whollyWithinUnit(state, id, me.id, range) && seesUnit(state, me.id, id)))
}

const mistActivate: ActivatedAbilityHook & { targets: typeof mistTargets } = {
  canUse: (state, unitId, use) => pickedOk(mistTargets(state, unitId), use),
  targets: mistTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    const caster = onBoard(s, use.unitId)
    if (!target || !caster) return
    const need = num(paramOf(s, use.abilityId, 'succeedOn', 3), 3)
    const rolled = ctx.rollExpr('D6', { purpose: 'ability', player: use.player, unitId: caster.id, commandRerollable: false }).total
    // Arch-Ritualist: +1 to the roll
    const bonus = caster.enhancementId === ARCH_RITUALIST ? 1 : 0
    const total = rolled + bonus
    if (total < need) {
      announce(ctx, use, target.id, `Ritual of the Creeping Mist: rolled ${rolled}${bonus ? ` +${bonus}` : ''}, the mist does not gather`)
      return
    }
    // scope 'attacker': the holder is the unit being attacked, the modified roll is the attacker's wound roll
    const effect: Effect = { modifyRoll: { roll: 'wound', value: -1 } }
    // F18 (HOH C3): "until your next turn" is the caster's next turn, not the enemy holder's
    effectService.grant(ctx, target.id, effect, { sourceAbilityId: use.abilityId, sourceUnitId: caster.id, scope: { who: 'attacker' }, duration: 'untilNextTurn', expiryOwner: use.player })
    announce(ctx, use, target.id, `Ritual of the Creeping Mist: rolled ${rolled}${bonus ? ` +${bonus}` : ''}, attacks against ${target.name} get -1 to wound until your next turn`)
  },
}
const idonethCreepingMist: EngineCodeHook = { name: CODE_MIST, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: mistActivate }

// ---------- IDK-AB-2 Biovoltaic Blast ----------
function blastTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me || !me.turn.chargedThisTurn) return []
  const range = num(paramsByCode(state, me.id, CODE_BLAST).within, 1)
  return unitsOf(state, other(me.player)).filter((id) => unitGap(state, me.id, id) <= range + EPS)
}

const blastActivate: ActivatedAbilityHook & { targets: typeof blastTargets } = {
  canUse: (state, unitId, use) => pickedOk(blastTargets(state, unitId), use),
  targets: blastTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const me = onBoard(s, use.unitId)
    const target = onBoard(s, use.targetUnitIds[0])
    if (!me || !target) return
    const dice = liveModels(s, me.id).length
    if (dice <= 0) return
    const bonus = liveModels(s, target.id).length > dice ? 1 : 0
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: dice, mode: 'perDie', unitId: me.id, targetUnitId: target.id, commandRerollable: false })
    let total = 0
    for (const d of roll.final) {
      const v = d + bonus
      if (v >= 6) total += ctx.rollExpr('D3', { purpose: 'ability', player: use.player, unitId: me.id, targetUnitId: target.id, commandRerollable: false }).total
      else if (v >= 4) total += 1
    }
    announce(ctx, use, target.id, `Biovoltaic Blast: ${dice} dice${bonus ? ' (+1, the target has more models)' : ''} against ${target.name}, ${total} mortal damage`)
    inflictMortal(ctx, use, target.id, total)
  },
}
const idonethBiovoltaicBlast: EngineCodeHook = { name: CODE_BLAST, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: blastActivate }

// ---------- IDK-AB-3 Bloodthirsty Predators ----------
const idonethBloodthirstyPredators: EngineCodeHook = {
  name: CODE_BLOODTHIRSTY, kind: 'ability', hook: 'onStatQuery', run: noop,
  // the Bite is a Companion weapon; the ability names it, so it reaches it
  affectsCompanion: true,
  statDelta(state, entry, q) {
    if (q.stat !== 'A' || q.weapon?.id !== BITE_ID || q.unitId !== entry.holderUnitId) return 0
    const me = onBoard(state, entry.holderUnitId)
    if (!me) return 0
    const range = num(entry.params.range, 6)
    const bloodied = unitsOf(state, other(me.player)).some((id) => unitGap(state, me.id, id) <= range + EPS && (isDamaged(state, id) || lostModelThisTurn(state, id)))
    return bloodied ? num(entry.params.attacks, 1) : 0
  },
}

// ---------- a rough melee estimate for the AI hints (kept here so the engine does not import src/ai) ----------
const rollP = (target: number): number => Math.max(1 / 6, Math.min(5 / 6, (7 - target) / 6))

// expected melee damage `attackerId` deals to `targetId` in one fight activation
function meleeEstimate(state: GameState, attackerId: UnitId, targetId: UnitId): number {
  const defenders = liveModels(state, targetId)
  if (defenders.length === 0) return 0
  const dst = modelStats(state, defenders[0])
  let total = 0
  for (const m of liveModels(state, attackerId)) {
    for (const wid of m.weapons) {
      const w = weaponService.effectiveWeapon(state, m.id, wid)
      if (!w || w.kind !== 'melee') continue
      const hits = diceExprMean(w.A) * (w.skill === null ? 1 : rollP(w.skill))
      const need = dst.Sv + w.rend
      const unsaved = dst.noSave || need > 6 ? 1 : 1 - rollP(need)
      let dmg = hits * rollP(w.wound) * unsaved * diceExprMean(w.D)
      if (dst.ward !== null) dmg *= 1 - rollP(dst.ward)
      total += dmg
    }
  }
  return total
}

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus; null = no opinion) ----------
// below -2 the bot passes instead of using the ability. Ability-use options carry no unit hint for army abilities.
export function idonethAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  switch (code) {
    case CODE_MIND: {
      // once per battle: the first combat phase the bearer stands in combat with an enemy unit that has yet to swing
      const bearer = unitId ?? generalOf(state, player)
      if (!bearer) return -3
      return enemiesInCombat(state, bearer).some((e) => !state.units[e]?.turn.foughtThisPhase && meleeEstimate(state, e, bearer) >= 1) ? 1 : -3
    }
    case CODE_PREDATORS:
      return predatorTargets(state, null, player).length > 0 ? 0 : -3
    case CODE_MORSELS: {
      const general = unitId ?? generalOf(state, player)
      return general && morselTargets(state, general).length > 0 ? 0 : -3
    }
    case CODE_BLAST:
      // once per battle, but only offered right after a charge: spend it when the dice can do real work
      return 0
    default:
      return null
  }
}

export function idonethTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_MIST: {
      // the friendly unit that will be attacked soonest: in combat with the heaviest hitters, Cavalry first, nearest enemy otherwise
      const threat = enemiesInCombat(state, unitId).reduce((n, e) => n + meleeEstimate(state, e, unitId), 0)
      const near = unitsOf(state, other(player)).reduce((n, e) => Math.min(n, unitGap(state, unitId, e)), 30)
      return Math.min(4, threat * 0.4) + (hasKeyword(state, unitId, 'CAVALRY') ? 1 : 0) - Math.min(30, near) * 0.08 + Math.min(2, woundsLeft(state, unitId) * 0.05)
    }
    case CODE_BLAST: {
      // more models than the Guard has (+1 on every die) and the weakest unit first, so the damage kills models
      const mine = unitsOf(state, player).find((id) => state.units[id].turn.chargedThisTurn && hasKeyword(state, id, 'CAVALRY') && unitGap(state, id, unitId) <= 1 + EPS)
      const bonus = mine && liveModels(state, unitId).length > liveModels(state, mine).length ? 2 : 0
      return bonus + Math.max(0, 8 - woundsLeft(state, unitId)) * 0.15
    }
    case CODE_MIND: {
      // the enemy unit that has not fought yet and hits hardest
      const bearer = generalOf(state, player)
      const hits = bearer ? meleeEstimate(state, unitId, bearer) : 0
      return Math.min(6, hits) + (unit.turn.foughtThisPhase ? -4 : 0)
    }
    case CODE_PREDATORS:
      // the most damaged Cavalry unit
      return liveModels(state, unitId).reduce((n, m) => n + Math.max(0, modelStats(state, m).W - m.woundsRemaining), 0)
    default:
      return null
  }
}

export const idonethHooks: Record<string, EngineCodeHook> = {
  idonethTides, idonethEtherseaPredators, idonethMindFlare, idonethDeliciousMorsels, idonethCreepingMist, idonethBiovoltaicBlast,
  idonethBloodthirstyPredators,
}
