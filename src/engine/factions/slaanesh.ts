// Hedonites of Slaanesh (Epicurean Revellers) code hooks: docs/spec/factions/hedonites-of-slaanesh.md (HOS-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/slaanesh/abilities.json uses. What each hook
// needs from data:
//
//  slaaneshFavourMostFickle (BT-1)      passive; the descriptor carries one effect per band (+2 Control, +1 melee hit, +1 melee wound,
//        +1 run, +1 charge, Ward 5+, +2 melee Attacks) and `gate` opens only the effect of the band the army is in now: it reads which
//        stat / roll the engine is asking about from the hook data and compares it with favourBand(favourCount(...)). Companion weapons
//        take the hit / wound / Attacks bands through Effect.affectsCompanion. `resourceReadout` shows the count in the HUD.
//  slaaneshBringersOfDegradation (RA-1) regiment ability offered in the fightAfter window (params.window 'afterFight'): the unit that
//        just fought is a friendly Daemonettes unit that was not itself chained and another one could be picked now; resolve chains it
//        (phases/fight.ts chainFight).
//  slaaneshDaemonicOnslaught (RA-2)     regiment ability, deployment window, once per battle: a Seekers or Fiends unit wholly within
//        params.range of the general with a legal Normal Move; resolve queues the slide (writeMoveQueue, normalMove).
//  slaaneshTwistedGrace (ENH-1)         passive; pileInBonus answers D6 for the general's unit in a turn in which it charged.
//  slaaneshHighCourtiers (ENH-2)        passive; adjustFeelNoPain gives the general and a Daemonettes unit Ward 5+ while the general is
//        wholly within params.range of that Daemonettes unit.
//  slaaneshExcessOfViolence (ENH-3)     any combat phase, once per battle; target = a visible friendly unit wholly within params.range of
//        the general (the general's unit counts); grants Crit (2 Hits) on melee and Companion weapons until the start of its next turn.
//  slaaneshSoulMusk (ENH-4)             movement phase, once per battle; target = a visible friendly Seekers or Fiends unit wholly within
//        params.range of the general; resolve lifts it and queues the set-up (redeploy.ts, more than params.minEnemyDistance from enemies).
//  slaaneshDispensersOfFavour (AB-2)    a Spell (castingValue in data, rolled by abilities.ts); up to one target per live model of the
//        caster (maxTargets), each a friendly Daemonettes / Seekers / Fiends unit wholly within params.range of the caster.
//  slaaneshSoporificMusk (AB-3)         any charge phase, once per turn for the army; abilities.ts rolls the declared D6 (4+); target =
//        an enemy unit in combat with the Fiends, or (out of combat) a visible enemy unit within params.range; resolve = Strike-last.
//  Thricefold Court (AB-1) is a data marker read by favourCount; Lithe and Swift (AB-4) and Quicksilver Speed (AB-5) are data only.
//
//  AI hints: slaaneshAbilityTiming / slaaneshTargetBonus below are read by src/ai/utility.ts (abilityTiming / abilityTargetBonus).
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook, FactionResource } from '../code-hooks'
import type { DiceExpr, Effect } from '../../data/types'
import type { GameState, PlayerId, RuntimeAbility, UnitId } from '../types'
import { EPS } from '../geometry'
import { diceExprMean } from '../dice'
import { effectService } from '../effects'
import { losService } from '../los'
import { hookService } from '../hooks-impl'
import { requestRedeploy } from '../redeploy'
import { chainFight, fightPickable, isChainedFight } from '../phases/fight'
import { boardUnitsOf, modelStats } from '../state'
import { weaponService } from '../weapons'
import { checkSlide, writeMoveQueue, type SlideOpts } from './aos-moves'
import {
  announce, enemiesInCombat, hasKeyword as unitHasKeyword, inCombat, liveModels, onBoard, unitGap, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

const CODE_FAVOUR = 'slaaneshFavourMostFickle'
const CODE_BRINGERS = 'slaaneshBringersOfDegradation'
const CODE_ONSLAUGHT = 'slaaneshDaemonicOnslaught'
const CODE_GRACE = 'slaaneshTwistedGrace'
const CODE_COURTIERS = 'slaaneshHighCourtiers'
const CODE_EXCESS = 'slaaneshExcessOfViolence'
const CODE_MUSK = 'slaaneshSoulMusk'
const CODE_DISPENSERS = 'slaaneshDispensersOfFavour'
const CODE_SOPORIFIC = 'slaaneshSoporificMusk'

const COURT_ABILITY = 'slaanesh.ability.thricefold-court'
const DAEMONETTES = 'DAEMONETTES'
const SEEKERS = 'SEEKERS'
const FIENDS = 'FIENDS'

const unitsOf = (state: GameState, player: PlayerId): UnitId[] => boardUnitsOf(state, player).map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}
const playerOf = (state: GameState, use: { player?: PlayerId }): PlayerId => use.player ?? state.activePlayer
const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}
const moveOf = (state: GameState, unitId: UnitId): number =>
  Math.max(0, ...liveModels(state, unitId).map((m) => hookService.statFor(state, { unitId, modelId: m.id, weapon: null, stat: 'M' }, modelStats(state, m).M)))

// ---------- the Favour count and band (HOS-BT-1, HOS-AB-1) ----------
const isCourt = (state: GameState, unitId: UnitId): boolean => {
  const u = state.units[unitId]
  return !!u && (state.datasheets[u.datasheetId]?.abilities ?? []).includes(COURT_ABILITY)
}

/** the units Favour Most Fickle counts for the player: every unit on the battlefield, each live model of the Thricefold Discord on its own */
export function favourCount(state: GameState, player: PlayerId): number {
  let n = 0
  for (const u of boardUnitsOf(state, player)) n += isCourt(state, u.id) ? u.models.filter((id) => (state.models[id]?.woundsRemaining ?? 0) > 0).length : 1
  return n
}

export type FavourBand = 'control' | 'combat' | 'move' | 'ward' | 'attacks'

/** the one bonus the army holds at this count (the bands do not add up); null with no unit left */
export function favourBand(count: number): FavourBand | null {
  if (count >= 5) return 'control'
  if (count === 4) return 'combat'
  if (count === 3) return 'move'
  if (count === 2) return 'ward'
  if (count === 1) return 'attacks'
  return null
}

const BAND_TEXT: Record<FavourBand, string> = {
  control: '+2 Control', combat: '+1 to hit and wound (combat)', move: '+1 to run and charge rolls', ward: 'Ward (5+)', attacks: '+2 melee Attacks',
}

// which band's effect the engine is asking about (read from the hook data), or null when it is none of the seven
function favourQuery(data: Record<string, unknown> | undefined): FavourBand | null {
  if (!data) return null
  const roll = data.roll as { purpose?: string } | null | undefined
  if (data.attack && roll) {
    if (roll.purpose === 'hit' || roll.purpose === 'wound') return 'combat'
    if (roll.purpose === 'fnp') return 'ward'
    return null
  }
  if (typeof data.chargingUnitId === 'string' || typeof data.movingUnitId === 'string') return 'move'
  if (data.stat === 'OC') return 'control'
  if (data.stat === 'A') return 'attacks'
  return null
}

const slaaneshFavourMostFickle: EngineCodeHook = {
  name: CODE_FAVOUR, kind: 'ability', hook: 'onStatQuery', run: noop,
  gate(state, holder, _entry, data) {
    const q = favourQuery(data)
    return q !== null && favourBand(favourCount(state, holder.player)) === q
  },
  // The engine hangs the general's enhancement on its first model (Vexmor); the spec gives it to the general, the whole three-model unit.
  // When that model is slain the enhancement moves to a surviving model of the unit (the ability record is replaced, never edited:
  // state.abilities entries are shared with the data bundle).
  onOwnModelSlain(ctx, info) {
    const s = ctx.state
    if (!isCourt(s, info.unitId)) return
    const heir = s.units[info.unitId]?.models.find((id) => !!s.models[id])
    if (!heir) return
    const moved: Record<string, RuntimeAbility> = {}
    for (const a of Object.values(s.abilities) as RuntimeAbility[]) if (a.source === 'enhancement' && a.bearerModelId === info.model.id) moved[a.id] = { ...a, bearerModelId: heir }
    if (Object.keys(moved).length > 0) s.abilities = { ...s.abilities, ...moved }
  },
  resourceReadout(state, _ability, player): FactionResource | null {
    const n = favourCount(state, player)
    const band = favourBand(n)
    return {
      id: 'slaanesh.favour', label: 'Favour', value: n, max: 7,
      help: band ? `${n} unit${n === 1 ? '' : 's'} count: every friendly unit has ${BAND_TEXT[band]}. The fewer units, the closer to the final bonus.` : 'No unit left to count.',
    }
  },
}

// ---------- HOS-RA-1 Bringers of Degradation ----------
// the other friendly Daemonettes units that could be picked to fight right now
function bringersTargets(state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] {
  const p = player ?? state.activePlayer
  const fight = state.phaseState.fight
  const cur = fight?.currentUnitId
  if (state.phase !== 'fight' || !cur || state.units[cur]?.player !== p || !unitHasKeyword(state, cur, DAEMONETTES) || isChainedFight(state, cur)) return []
  return unitsOf(state, p).filter((id) => id !== cur && unitHasKeyword(state, id, DAEMONETTES) && fightPickable(state, id))
}
const bringersActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => bringersTargets(state, unitId, playerOf(state, use)).length > 0,
  targets: bringersTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target || !bringersTargets(s, null, use.player).includes(target.id)) return
    chainFight(s, target.id)
    announce(ctx, use, target.id, `Bringers of Degradation: ${target.name} fights straight after this unit`)
  },
}
const slaaneshBringersOfDegradation: EngineCodeHook = { name: CODE_BRINGERS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: bringersActivate }

// ---------- HOS-RA-2 Daemonic Onslaught ----------
const normalMove: SlideOpts = { normalMove: true }
const PROBE = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2)

// a cheap legality probe: some short Normal-Move slide exists
function canSlide(state: GameState, unitId: UnitId): boolean {
  const move = moveOf(state, unitId)
  if (move <= 0) return false
  const d = Math.min(1, move)
  return PROBE.some((a) => checkSlide(state, unitId, Math.cos(a) * d, Math.sin(a) * d, move, false, normalMove).ok)
}

function onslaughtTargets(state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] {
  const p = player ?? state.activePlayer
  const general = generalOf(state, p)
  if (!general) return []
  const reg = state.abilities[state.players[p]?.regimentAbilityId ?? '']
  const range = reg?.code === CODE_ONSLAUGHT ? num(reg.params?.range, 12) : 12
  return unitsOf(state, p).filter((id) => (unitHasKeyword(state, id, SEEKERS) || unitHasKeyword(state, id, FIENDS)) && whollyWithinUnit(state, id, general, range) && !inCombat(state, id) && canSlide(state, id))
}
const onslaughtActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(onslaughtTargets(state, unitId, playerOf(state, use)), use),
  targets: onslaughtTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const move = moveOf(s, target.id)
    // approximation: a rigid slide from the engine's heading list, as every out-of-phase move
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: move, queue: [target.id], opts: normalMove })
    announce(ctx, use, target.id, `Daemonic Onslaught: ${target.name} may make a Normal Move of up to ${move}" now`)
  },
}
const slaaneshDaemonicOnslaught: EngineCodeHook = { name: CODE_ONSLAUGHT, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: onslaughtActivate }

// ---------- HOS-ENH-1 Twisted Grace ----------
const slaaneshTwistedGrace: EngineCodeHook = {
  name: CODE_GRACE, kind: 'ability', hook: 'onStatQuery', run: noop,
  pileInBonus(state, entry, unitId): DiceExpr | null {
    if (unitId !== entry.holderUnitId || !state.units[unitId]?.turn.chargedThisTurn) return null
    return (entry.params.bonus as DiceExpr | undefined) ?? 'D6'
  },
}

// ---------- HOS-ENH-2 High Courtiers ----------
// a friendly Daemonettes unit the general stands wholly within combat range of
function courtiersOf(state: GameState, general: UnitId, range: number): UnitId[] {
  const g = state.units[general]
  if (!g) return []
  return unitsOf(state, g.player).filter((id) => id !== general && unitHasKeyword(state, id, DAEMONETTES) && whollyWithinUnit(state, general, id, range))
}
const slaaneshHighCourtiers: EngineCodeHook = {
  name: CODE_COURTIERS, kind: 'ability', hook: 'onStatQuery', run: noop,
  adjustFeelNoPain(state, entry, modelId, current) {
    const model = state.models[modelId]
    const holder = onBoard(state, entry.holderUnitId)
    if (!model || !holder) return null
    const unit = state.units[model.unitId]
    if (!unit || unit.player !== holder.player) return null
    const range = num(entry.params.range, 3)
    const courtiers = courtiersOf(state, holder.id, range)
    if (unit.id !== holder.id && !courtiers.includes(unit.id)) return null
    if (courtiers.length === 0) return null
    return { threshold: Math.min(current ?? 7, num(entry.params.ward, 5)), modifier: 0 }
  },
}

// ---------- HOS-ENH-3 Excess of Violence ----------
// visible friendly units wholly within range of the general (its own unit included)
function excessTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(state.abilities['slaanesh.ability.excess-of-violence']?.params?.range, 12)
  const mine = liveModels(state, me.id)
  return unitsOf(state, me.player).filter((id) => whollyWithinUnit(state, id, me.id, range) && (id === me.id || mine.some((m) => losService.unitVisible(state, m.id, id))))
}
const excessActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(excessTargets(state, unitId), use),
  targets: excessTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const effect: Effect = { when: { weaponType: 'melee' }, grantWeaponAbility: { ability: 'CRIT_2_HITS' }, affectsCompanion: true }
    effectService.grant(ctx, target.id, effect, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn' })
    announce(ctx, use, target.id, `Excess of Violence: the melee weapons of ${target.name} have Crit (2 Hits) until the start of your next turn`)
  },
}
const slaaneshExcessOfViolence: EngineCodeHook = { name: CODE_EXCESS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: excessActivate }

// ---------- HOS-ENH-4 Irresistible Soul-Musk ----------
function muskTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(state.abilities['slaanesh.ability.irresistible-soul-musk']?.params?.range, 12)
  const mine = liveModels(state, me.id)
  return unitsOf(state, me.player).filter((id) => (unitHasKeyword(state, id, SEEKERS) || unitHasKeyword(state, id, FIENDS)) && whollyWithinUnit(state, id, me.id, range) && mine.some((m) => losService.unitVisible(state, m.id, id)))
}
const muskActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(muskTargets(state, unitId), use),
  targets: muskTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const minEnemyDistance = num(s.abilities[use.abilityId]?.params?.minEnemyDistance, 6)
    // markSetUp: CORE-6.13, the unit uses no Move abilities for the rest of this movement phase
    requestRedeploy(s, { abilityId: use.abilityId, player: use.player, unitIds: [target.id], minEnemyDistance, markSetUp: true })
    announce(ctx, use, target.id, `Irresistible Soul-Musk: ${target.name} vanishes and will be set up again more than ${minEnemyDistance}" from every enemy unit`)
  },
}
const slaaneshSoulMusk: EngineCodeHook = { name: CODE_MUSK, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: muskActivate }

// ---------- HOS-AB-2 Dispensers of Favour ----------
const DISPENSER_EFFECT: { keyword: string; effect: Effect; said: string }[] = [
  { keyword: DAEMONETTES, effect: { grantWeaponAbility: { ability: 'ANTI', keyword: '@charged', value: 1 } }, said: 'Anti-charge (+1 Rend)' },
  { keyword: SEEKERS, effect: { modifyStat: { stat: 'M', value: 2 } }, said: '+2" Move' },
  { keyword: FIENDS, effect: { when: { weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: 1 } }, said: '+1 to hit for combat attacks' },
]
const dispenserFor = (state: GameState, unitId: UnitId) => DISPENSER_EFFECT.find((d) => unitHasKeyword(state, unitId, d.keyword))

function dispenserTargets(state: GameState, unitId: UnitId | null, player?: PlayerId): UnitId[] {
  const mage = onBoard(state, unitId)
  if (!mage) return []
  const range = num(state.abilities['slaanesh.ability.dispensers-of-favour']?.params?.range, 12)
  return unitsOf(state, player ?? mage.player).filter((id) => id !== mage.id && !!dispenserFor(state, id) && whollyWithinUnit(state, id, mage.id, range))
}
const dispenserActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => dispenserTargets(state, unitId, playerOf(state, use)).length > 0 && (!use.targetUnitIds?.length || use.targetUnitIds.every((t) => dispenserTargets(state, unitId, playerOf(state, use)).includes(t))),
  targets: dispenserTargets,
  // X different units, X = the models in the Thricefold Discord at the moment of declaring
  maxTargets: (state, unitId) => (unitId ? liveModels(state, unitId).length : 1),
  resolve(ctx, use) {
    const s = ctx.state
    for (const id of use.targetUnitIds) {
      const target = onBoard(s, id)
      const d = target ? dispenserFor(s, id) : undefined
      if (!target || !d) continue
      effectService.grant(ctx, target.id, d.effect, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn' })
      announce(ctx, use, target.id, `Dispensers of Favour: ${target.name} has ${d.said} until the start of your next turn`)
    }
  },
}
const slaaneshDispensersOfFavour: EngineCodeHook = { name: CODE_DISPENSERS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: dispenserActivate }

// ---------- HOS-AB-3 Soporific Musk ----------
function soporificTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  if (inCombat(state, me.id)) return enemiesInCombat(state, me.id).sort()
  const range = num(state.abilities['slaanesh.ability.soporific-musk']?.params?.range, 9)
  const mine = liveModels(state, me.id)
  return unitsOf(state, other(me.player)).filter((id) => unitGap(state, me.id, id) <= range + EPS && mine.some((m) => losService.unitVisible(state, m.id, id)))
}
const soporificActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(soporificTargets(state, unitId), use),
  targets: soporificTargets,
  // abilities.ts rolls the declared D6 and only calls resolve on the 4+
  resolve(ctx, use) {
    const target = onBoard(ctx.state, use.targetUnitIds[0])
    if (!target) return
    target.turn.fightsLast = true
    announce(ctx, use, target.id, `Soporific Musk: ${target.name} has Strike-last for the rest of the turn`)
  },
}
const slaaneshSoporificMusk: EngineCodeHook = { name: CODE_SOPORIFIC, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: soporificActivate }

// ---------- a rough damage estimate for the AI hints (kept here so the engine does not import src/ai) ----------
const rollP = (target: number): number => Math.max(1 / 6, Math.min(5 / 6, (7 - target) / 6))

// expected melee damage `attackerId` deals to `targetId` in one full activation
function meleeDamage(state: GameState, attackerId: UnitId, targetId: UnitId): number {
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

const meleeThreat = (state: GameState, unitId: UnitId): number =>
  enemiesInCombat(state, unitId).filter((e) => !state.units[e]?.turn.foughtThisPhase).reduce((n, e) => n + meleeDamage(state, e, unitId), 0)

const meleeAttacks = (state: GameState, unitId: UnitId): number =>
  liveModels(state, unitId).reduce((n, m) => n + m.weapons.reduce((a, w) => {
    const wp = state.weapons[w]
    return a + (wp && wp.kind === 'melee' && !wp.abilities.some((x) => x.ability === 'COMPANION') ? diceExprMean(wp.A) : 0)
  }, 0), 0)

const nearestEnemyGap = (state: GameState, unitId: UnitId, player: PlayerId): number =>
  Math.min(30, ...unitsOf(state, other(player)).map((e) => unitGap(state, unitId, e)))

// a unit that fights this turn or soon: in combat, or an enemy within a charge's reach
const busy = (state: GameState, unitId: UnitId, player: PlayerId, reach = 12.5): boolean => inCombat(state, unitId) || nearestEnemyGap(state, unitId, player) <= reach

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus; null = no opinion) ----------
// below -2 the bot passes instead of using the ability. Ability-use options carry no unit hint, so general-bound abilities fall back to
// the army's general.
export function slaaneshAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  switch (code) {
    case CODE_BRINGERS:
      // always chain the second Daemonettes unit
      return 0
    case CODE_ONSLAUGHT:
      // the free move at the start of the battle is always worth taking
      return 0
    case CODE_DISPENSERS: {
      const mage = unitId ?? generalOf(state, player)
      if (!mage) return -3
      return dispenserTargets(state, mage, player).some((id) => busy(state, id, player, 18)) ? 0 : -3
    }
    case CODE_SOPORIFIC: {
      // worth the roll when the target is in combat with, or about to be reached by, our units
      const me = unitId ?? unitsOf(state, player).find((id) => unitHasKeyword(state, id, FIENDS)) ?? null
      if (!me) return -3
      return soporificTargets(state, me).some((e) => unitsOf(state, player).some((f) => unitGap(state, f, e) <= 3.5)) ? 0 : -3
    }
    case CODE_EXCESS: {
      // once per battle: the phase a unit with 8 or more melee attacks is in combat (any in combat in the last two rounds)
      const general = unitId ?? generalOf(state, player)
      if (!general) return -3
      const targets = excessTargets(state, general)
      if (targets.some((id) => inCombat(state, id) && meleeAttacks(state, id) >= 8)) return 0
      return state.round >= 4 && targets.some((id) => inCombat(state, id)) ? 0 : -3
    }
    case CODE_MUSK: {
      // once per battle: teleport a Seekers / Fiends unit out of a losing combat, or onto ground it could not reach by walking
      const general = unitId ?? generalOf(state, player)
      if (!general) return -3
      const targets = muskTargets(state, general)
      const losing = targets.some((id) => inCombat(state, id) && meleeThreat(state, id) >= woundsLeft(state, id) * 0.5)
      if (losing) return 0
      const far = targets.some((id) => !inCombat(state, id) && Object.values(state.objectives).some((o) => !o.removed && o.controller !== player
        && Math.min(...liveModels(state, id).map((m) => Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z))) > moveOf(state, id) + 2))
      return far && state.round >= 2 ? 0 : -3
    }
    default:
      return null
  }
}

export function slaaneshTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_ONSLAUGHT:
      // Seekers first (the longer reach), the Fiends otherwise
      return unitHasKeyword(state, unitId, SEEKERS) ? 2 : 1
    case CODE_DISPENSERS:
      // Fiends in or near combat, Daemonettes about to be charged or charging, Seekers with ground to cover
      if (unitHasKeyword(state, unitId, FIENDS)) return busy(state, unitId, player, 18) ? 3 : 0.5
      if (unitHasKeyword(state, unitId, DAEMONETTES)) return busy(state, unitId, player, 18) ? 2 : 0.3
      return inCombat(state, unitId) ? 0.2 : 1
    case CODE_EXCESS:
      return Math.min(4, meleeAttacks(state, unitId) * 0.15) + (inCombat(state, unitId) ? 3 : 0)
    case CODE_MUSK:
      return (unitHasKeyword(state, unitId, SEEKERS) ? 1 : 0.5) + (inCombat(state, unitId) ? meleeThreat(state, unitId) / Math.max(1, woundsLeft(state, unitId)) * 2 : 0)
    case CODE_SOPORIFIC:
      // the enemy unit that would hit our units hardest if it struck first
      return unitsOf(state, player).reduce((n, f) => n + (unitGap(state, f, unitId) <= 3.5 ? meleeDamage(state, unitId, f) : 0), 0) * 0.4
    default:
      return null
  }
}

export const slaaneshHooks: Record<string, EngineCodeHook> = {
  slaaneshFavourMostFickle, slaaneshBringersOfDegradation, slaaneshDaemonicOnslaught, slaaneshTwistedGrace, slaaneshHighCourtiers,
  slaaneshExcessOfViolence, slaaneshSoulMusk, slaaneshDispensersOfFavour, slaaneshSoporificMusk,
}
