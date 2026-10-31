// Blades of Khorne (Fangs of the Blood God) code hooks: docs/spec/factions/blades-of-khorne.md (BOK-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/khorne/abilities.json uses. Activated abilities
// use `activate` (hooks.ts ActivatedAbilityHook, run by abilities.ts); passive rules are declarative descriptors. What each hook
// needs from data:
//
//  khorneTheQuarry (BT-1)         army ability, startOfRound / any, params.mandatory (no pass while offered). Target = an enemy unit on the
//        battlefield or in reserve; resolve puts a `quarry` token on it (SPH-2.7 tokens, so the unit card shows it). The quarry of a player is
//        the unit of the OTHER player, not destroyed, that holds the token; a Call for Reinforcements replacement is a new unit and has none.
//  khorneBloodDrenched (BT-2)     army ability, endOfTurn / any, oncePerTurnArmy. Target = a friendly unit the turn ledger says slew a model
//        with a combat attack this turn (attack.ts slewInFightThisTurn) that does not hold the effect yet; grants Crit (Mortal) on melee
//        weapons for the rest of the battle.
//  khorneScentOfBlood (RA-1)      regiment descriptor { +1 hit, +1 wound on melee } sitting on every friendly unit; `gate` closes it unless the
//        attack's target had damage allocated this turn (attack.ts damagedThisTurn).
//  khorneSavagery (RA-2)          regiment ability, fight / any, oncePerBattle. Target = a friendly unit in combat; +params.extraAttacks Attacks
//        on its melee weapons until the end of the turn, +D3 (one roll) for a Hero.
//  khorneStalkThePrey (AB-1)      Karanak, hero phase / any. Rolls a D6 and queues a rigid slide of up to that many inches (aos-moves
//        writeMoveQueue): out of combat it may not end in combat, in combat it ends free; closerToUnit = the quarry while it is on the battlefield.
//  khornePackHunters (AB-3)       Claws, fight / any. Target = an enemy unit in combat with this unit and with a friendly Flesh Hounds unit;
//        grants { lethalOn 5 } on melee until the end of the turn, `gateEffect` limits it to attacks on that target (ledger
//        mission.custom.bokPack keyed by the granted effect's id).
//  khorneSustainedByGore (ENH-1)  end of any turn; Heal (params.heal) the bearer while it is damaged.
//  khorneKillingPounce (ENH-3)    charge phase start / your, oncePerBattle. Grants the bearer { extraChargeDice 1 } until the end of the turn; the
//        same hook answers chargeMustEndInCombatWith (F14 C3) with the quarry while that effect is on the unit.
//  khorneFuriousBites (ENH-4)     end of any turn; params.damage mortal damage on the quarry while the bearer is in combat with it.
//  Unflagging Hunters (AB-2, +1 charge) and Evasive Hunter (ENH-2, scope attacker) are data only.
//
//  AI hints: khorneAbilityTiming / khorneTargetBonus below are read by src/ai/utility.ts (abilityTiming / abilityTargetBonus).
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { DiceExpr, Effect } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { diceExprMean } from '../dice'
import { slewInFightThisTurn, damagedThisTurn } from '../attack'
import { effectService } from '../effects'
import type { AttackContext } from '../hooks'
import { chargeDiceCount, neededChargeDistance } from '../phases/charge'
import { modelStats } from '../state'
import { weaponService } from '../weapons'
import { slideOptions, writeMoveQueue, type SlideOpts } from './aos-moves'
import {
  announce, enemiesInCombat, hasKeyword, healUnit, inCombat, inflictMortal, isDamaged, isDatasheet, liveModels, onBoard, paramOf, unitGap,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const TOKEN = 'quarry'
const CODE_QUARRY = 'khorneTheQuarry'
const CODE_BLOOD = 'khorneBloodDrenched'
const CODE_SCENT = 'khorneScentOfBlood'
const CODE_SAVAGERY = 'khorneSavagery'
const CODE_STALK = 'khorneStalkThePrey'
const CODE_PACK = 'khornePackHunters'
const CODE_GORE = 'khorneSustainedByGore'
const CODE_POUNCE = 'khorneKillingPounce'
const CODE_BITES = 'khorneFuriousBites'
const HOUNDS = 'khorne.unit.flesh-hounds'
const LEDGER = 'bokPack'

const unitsOf = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}

// ---------- the quarry ----------
// the enemy unit `player` has marked: not destroyed (on the battlefield or still in reserve), holding the token
export function khorneQuarryOf(state: GameState, player: PlayerId): UnitId | null {
  for (const u of Object.values(state.units)) {
    if (u.player !== player && (u.location === 'board' || u.location === 'reserves') && (u.tokens?.[TOKEN] ?? 0) > 0) return u.id
  }
  return null
}
export function quarryOnBoard(state: GameState, player: PlayerId): UnitId | null {
  const id = khorneQuarryOf(state, player)
  return id && state.units[id].location === 'board' ? id : null
}

// ---------- BOK-BT-1 The Quarry ----------
// every enemy unit that is on the battlefield or in reserve, the ones on the table first
function quarryTargets(state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] {
  const p = player ?? state.activePlayer
  if (khorneQuarryOf(state, p)) return []
  const enemy = Object.values(state.units).filter((u) => u.player !== p && (u.location === 'board' || u.location === 'reserves'))
  return enemy.sort((a, b) => (a.location === b.location ? (a.id < b.id ? -1 : 1) : a.location === 'board' ? -1 : 1)).map((u) => u.id)
}

const quarryActivate: ActivatedAbilityHook = {
  canUse(state, _unitId, use) {
    const targets = quarryTargets(state, null, use.player)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: quarryTargets as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    const unit = target ? s.units[target] : undefined
    if (!unit || unit.player === use.player || unit.location === 'destroyed') return
    unit.tokens = { ...unit.tokens, [TOKEN]: 1 }
    announce(ctx, use, unit.id, `The Quarry: ${unit.name} is the quarry${unit.location === 'reserves' ? ' (still in reserve)' : ''}`)
  },
}
const khorneTheQuarry: EngineCodeHook = { name: CODE_QUARRY, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: quarryActivate }

// ---------- BOK-BT-2 Blood-Drenched ----------
const holdsBloodDrenched = (state: GameState, unitId: UnitId): boolean =>
  state.units[unitId].effects.some((e) => state.abilities[e.sourceAbilityId]?.code === CODE_BLOOD)

const bloodTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] =>
  unitsOf(state, player ?? state.activePlayer).filter((id) => slewInFightThisTurn(state, id) && !holdsBloodDrenched(state, id))

const bloodActivate: ActivatedAbilityHook = {
  canUse(state, _unitId, use) {
    const targets = bloodTargets(state, null, use.player)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: bloodTargets as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const effect: Effect = { when: { weaponType: 'melee' }, grantWeaponAbility: { ability: 'CRIT_MORTAL' } }
    effectService.grant(ctx, target, effect, { sourceAbilityId: use.abilityId, sourceUnitId: target, scope: { who: 'self' }, duration: 'battle' })
    announce(ctx, use, target, `Blood-Drenched: ${ctx.state.units[target].name}'s melee weapons have Crit (Mortal) for the rest of the battle`)
  },
}
const khorneBloodDrenched: EngineCodeHook = { name: CODE_BLOOD, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: bloodActivate }

// ---------- BOK-RA-1 The Scent of Blood ----------
const khorneScentOfBlood: EngineCodeHook = {
  name: CODE_SCENT, kind: 'ability', hook: 'onHitRoll', hooks: ['onHitRoll', 'onWoundRoll'], run: noop,
  // the descriptor's +1 / +1 only count against a target that had damage allocated to it this turn (any source)
  gate(state, _holder, _entry, data) {
    const attack = data?.attack as AttackContext | undefined
    return !!attack && damagedThisTurn(state, attack.targetUnitId)
  },
}

// ---------- BOK-RA-2 Savagery Upon Savagery ----------
const savageryTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] =>
  unitsOf(state, player ?? state.activePlayer).filter((id) => inCombat(state, id))

const savageryActivate: ActivatedAbilityHook = {
  canUse(state, _unitId, use) {
    const targets = savageryTargets(state, null, use.player)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: savageryTargets as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    // one roll for a Hero, applied to each of its melee weapons
    const hero = hasKeyword(s, target, 'HERO')
    const n = hero
      ? ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'heroAttacks', 'D3'), { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
      : num(paramOf(s, use.abilityId, 'extraAttacks', 1), 1)
    const effect: Effect = { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: n } }
    effectService.grant(ctx, target, effect, { sourceAbilityId: use.abilityId, sourceUnitId: target, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Savagery Upon Savagery: ${s.units[target].name}'s melee weapons have +${n} Attacks until the end of the turn`)
  },
}
const khorneSavagery: EngineCodeHook = { name: CODE_SAVAGERY, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: savageryActivate }

// ---------- BOK-AB-1 Stalk the Prey ----------
// out of combat the move may not end in combat; in combat it ends free; with the quarry on the battlefield it ends closer to it
function stalkOpts(state: GameState, unitId: UnitId): SlideOpts {
  const player = state.units[unitId].player
  const quarry = quarryOnBoard(state, player)
  const base: SlideOpts = inCombat(state, unitId) ? { endFree: true } : { mayNotEndInCombat: true }
  return quarry ? { ...base, closerToUnit: quarry } : base
}

// a cheap pre-check with the longest possible roll; the real distance is rolled at resolve
const canStalk = (state: GameState, unitId: UnitId | null): boolean => {
  const u = onBoard(state, unitId)
  return !!u && slideOptions(state, u.id, 6, stalkOpts(state, u.id)).length > 1
}

const stalkActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => canStalk(state, unitId),
  resolve(ctx, use) {
    const s = ctx.state
    const self = onBoard(s, use.unitId)
    if (!self) return
    const d = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'dice', 'D6'), { purpose: 'ability', player: use.player, unitId: self.id, commandRerollable: false }).total
    const opts = stalkOpts(s, self.id)
    if (slideOptions(s, self.id, d, opts).length <= 1) {
      announce(ctx, use, self.id, `Stalk the Prey: rolled ${d}, but ${self.name} has no legal move that far`)
      return
    }
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: d, queue: [self.id], opts })
    announce(ctx, use, self.id, `Stalk the Prey: rolled ${d}, ${self.name} may move up to ${d}"${opts.closerToUnit ? ', closer to the quarry' : ''}`)
  },
}
const khorneStalkThePrey: EngineCodeHook = { name: CODE_STALK, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: stalkActivate }

// ---------- BOK-AB-3 Pack Hunters ----------
const packLedger = (s: GameState): Record<string, UnitId> => (s.mission.custom[LEDGER] as Record<string, UnitId> | undefined) ?? {}

// enemy units in combat with this unit and with a friendly Flesh Hounds unit
function packTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const self = onBoard(state, unitId)
  if (!self) return []
  const hounds = unitsOf(state, self.player).filter((id) => id !== self.id && isDatasheet(state, id, HOUNDS, 'flesh-hounds'))
  return enemiesInCombat(state, self.id).filter((e) => hounds.some((h) => enemiesInCombat(state, h).includes(e))).sort()
}

const packActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const targets = packTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: packTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    const self = onBoard(s, use.unitId)
    if (!target || !self) return
    const crit = num(paramOf(s, use.abilityId, 'critOn', 5), 5)
    const eff = effectService.grant(ctx, self.id, { when: { weaponType: 'melee' }, lethalOn: crit as 2 | 3 | 4 | 5 | 6 }, { sourceAbilityId: use.abilityId, sourceUnitId: self.id, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    // drop entries of effects that are gone, then record this one
    const live = new Set<string>()
    for (const u of Object.values(s.units)) for (const e of u.effects) live.add(e.id)
    const kept = Object.fromEntries(Object.entries(packLedger(s)).filter(([id]) => live.has(id)))
    s.mission.custom = { ...s.mission.custom, [LEDGER]: { ...kept, [eff.id]: target } }
    announce(ctx, use, target, `Pack Hunters: ${self.name}'s attacks on ${s.units[target].name} score critical hits on 5+ until the end of the turn`)
  },
}
const khornePackHunters: EngineCodeHook = {
  name: CODE_PACK, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: packActivate,
  // the granted crit threshold only counts for attacks on the unit picked at the Declare
  gateEffect(state, _holder, entry, data) {
    if (!entry.active) return true
    const atk = data?.attack as AttackContext | undefined
    return !!atk && packLedger(state)[entry.active.id] === atk.targetUnitId
  },
  ensureEffects(ctx) {
    const s = ctx.state
    const all = packLedger(s)
    const ids = Object.keys(all)
    if (ids.length === 0) return
    const live = new Set<string>()
    for (const u of Object.values(s.units)) for (const e of u.effects) live.add(e.id)
    const keep = ids.filter((id) => live.has(id))
    if (keep.length === ids.length) return
    s.mission.custom = { ...s.mission.custom, [LEDGER]: Object.fromEntries(keep.map((id) => [id, all[id]])) }
  },
}

// ---------- BOK-ENH-1 Sustained by Gore ----------
const goreActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId) && isDamaged(state, unitId as UnitId),
  resolve(ctx, use) {
    const s = ctx.state
    const bearer = onBoard(s, use.unitId)
    if (!bearer) return
    const n = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'heal', 'D3'), { purpose: 'ability', player: use.player, unitId: bearer.id, commandRerollable: false }).total
    const healed = healUnit(ctx, bearer.id, n, use.abilityId)
    announce(ctx, use, bearer.id, `Sustained by Gore: Heal (${n}), ${healed} damage removed from ${bearer.name}`)
  },
}
const khorneSustainedByGore: EngineCodeHook = { name: CODE_GORE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: goreActivate }

// ---------- BOK-ENH-3 Killing Pounce ----------
const pounceActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const u = onBoard(state, unitId)
    if (!u || inCombat(state, u.id)) return false
    return !!quarryOnBoard(state, use.player ?? u.player)
  },
  resolve(ctx, use) {
    const s = ctx.state
    const bearer = onBoard(s, use.unitId)
    if (!bearer) return
    const dice = num(paramOf(s, use.abilityId, 'extraDice', 1), 1)
    effectService.grant(ctx, bearer.id, { extraChargeDice: dice }, { sourceAbilityId: use.abilityId, sourceUnitId: bearer.id, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, bearer.id, `Killing Pounce: ${bearer.name} rolls ${dice} extra charge dice this turn, but must end its charge in combat with the quarry`)
  },
}
const khorneKillingPounce: EngineCodeHook = {
  name: CODE_POUNCE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: pounceActivate,
  // F14 C3: while the granted effect is on the unit, its charge must end in combat with the quarry (empty = no constraint)
  chargeMustEndInCombatWith(state, entry, unitId) {
    if (!entry.active || entry.holderUnitId !== unitId) return null
    const q = quarryOnBoard(state, state.units[unitId].player)
    return q ? [q] : null
  },
}

// ---------- BOK-ENH-4 Furious Bites ----------
const bitesActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const u = onBoard(state, unitId)
    const q = u ? khorneQuarryOf(state, use.player ?? u.player) : null
    return !!u && !!q && enemiesInCombat(state, u.id).includes(q)
  },
  resolve(ctx, use) {
    const s = ctx.state
    const bearer = onBoard(s, use.unitId)
    const q = bearer ? khorneQuarryOf(s, use.player) : null
    if (!bearer || !q || !onBoard(s, q)) return
    const n = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'damage', 'D3'), { purpose: 'ability', player: use.player, unitId: q, commandRerollable: false }).total
    announce(ctx, use, q, `Furious Bites: ${n} mortal damage on ${s.units[q].name}`)
    inflictMortal(ctx, use, q, n)
  },
}
const khorneFuriousBites: EngineCodeHook = { name: CODE_BITES, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: bitesActivate }

// ---------- a rough melee estimate for the AI hints (kept here so the engine does not import src/ai) ----------
const rollP = (target: number): number => Math.max(1 / 6, Math.min(5 / 6, (7 - target) / 6))

// expected damage `attackerId` deals to `targetId` in one combat activation; `extraA` adds that many Attacks to every melee weapon
function meleeEstimate(state: GameState, attackerId: UnitId, targetId: UnitId, extraA = 0): number {
  const defenders = liveModels(state, targetId)
  if (defenders.length === 0) return 0
  const dst = modelStats(state, defenders[0])
  const hero = hasKeyword(state, targetId, 'HERO')
  let total = 0
  for (const m of liveModels(state, attackerId)) {
    for (const wid of m.weapons) {
      const w = weaponService.effectiveWeapon(state, m.id, wid)
      if (!w || w.kind !== 'melee') continue
      const attacks = diceExprMean(w.A) + extraA
      const hits = attacks * (w.skill === null ? 1 : rollP(w.skill))
      const anti = w.abilities.filter((a) => a.ability === 'ANTI' && (a.keyword === 'HERO' ? hero : false)).length
      const need = dst.Sv + w.rend + anti
      const unsaved = dst.noSave || need > 6 ? 1 : 1 - rollP(need)
      let dmg = hits * rollP(w.wound) * unsaved * diceExprMean(w.D)
      if (dst.ward !== null) dmg *= 1 - rollP(dst.ward)
      total += dmg
    }
  }
  return total
}

// enemy melee damage the unit stands to take from the enemies it is in combat with that have not fought yet
const meleeThreat = (state: GameState, unitId: UnitId): number =>
  enemiesInCombat(state, unitId).filter((e) => !state.units[e]?.turn.foughtThisPhase).reduce((n, e) => n + meleeEstimate(state, e, unitId), 0)

// P(sum of `dice` six-sided dice >= need)
function sumAtLeast(need: number, dice: number): number {
  let dist = [1]
  for (let d = 0; d < dice; d++) {
    const next = new Array(dist.length + 6).fill(0)
    dist.forEach((p, v) => { for (let f = 1; f <= 6; f++) next[v + f] += p / 6 })
    dist = next
  }
  return dist.reduce((a, p, v) => (v >= need ? a + p : a), 0)
}

// the extra attacks Savagery would give `unitId` (one D3 roll for a Hero, expected value) and what they are worth against its best target
function savageryGain(state: GameState, unitId: UnitId): number {
  const extra = hasKeyword(state, unitId, 'HERO') ? 2 : 1
  return Math.max(0, ...enemiesInCombat(state, unitId).map((e) => meleeEstimate(state, unitId, e, extra) - meleeEstimate(state, unitId, e, 0)))
}

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus; null = no opinion) ----------
// below -2 the bot passes instead of using the ability
export function khorneAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  // the abilityUse options carry no unit hint, so the bearer of Karanak's and the general's abilities is the general itself
  const self = unitId ?? generalOf(state, player)
  switch (code) {
    case CODE_QUARRY: return 1
    // the end-of-turn order the spec asks for: Furious Bites, then Blood-Drenched, then Sustained by Gore
    case CODE_BITES: return 2
    case CODE_BLOOD: return 1.5
    case CODE_GORE: return 1
    case CODE_PACK: return 1
    case CODE_STALK: {
      if (!self || !onBoard(state, self)) return -3
      const quarry = quarryOnBoard(state, player)
      const own = state.activePlayer === player
      if (inCombat(state, self)) {
        // stay and fight on our own turn; on theirs step out of a fight we would lose
        return !own && meleeThreat(state, self) >= woundsLeft(state, self) * 0.8 ? 1 : -3
      }
      if (quarry) return unitGap(state, self, quarry) > 6 ? 1 : 0
      return own && Object.values(state.units).some((u) => u.player !== player && u.location === 'board' && unitGap(state, self, u.id) <= 14) ? 0 : -3
    }
    case CODE_POUNCE: {
      // when two dice rarely reach the quarry and three dice usually do
      const general = self && onBoard(state, self)
      const quarry = quarryOnBoard(state, player)
      if (!general || !quarry) return -3
      const need = neededChargeDistance(state, general.id, [quarry])
      if (need === null) return -3
      const two = sumAtLeast(Math.ceil(need), chargeDiceCount(state, general.id))
      const three = sumAtLeast(Math.ceil(need), chargeDiceCount(state, general.id) + 1)
      return two < 0.6 && three >= 0.4 ? 1 : -3
    }
    case CODE_SAVAGERY: {
      // save the once-per-battle use for a fight that gains at least 0.75 expected damage, on a unit that has not swung yet
      const best = Math.max(0, ...unitsOf(state, player).filter((id) => inCombat(state, id) && !state.units[id].turn.foughtThisPhase).map((id) => savageryGain(state, id)))
      return best >= 0.75 ? 1 : -3
    }
    default:
      return null
  }
}

export function khorneTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_QUARRY: {
      // the enemy general if Karanak can reach it, else the closest unit worth hunting; units in reserve only as a last resort
      if (unit.location === 'reserves') return -6
      const mine = unitsOf(state, player)
      const hunter = generalOf(state, player)
      const gap = Math.min(40, ...(hunter ? [unitGap(state, hunter, unitId)] : mine.map((id) => unitGap(state, id, unitId))))
      const general = unitId === state.players[unit.player]?.warlordUnitId
      return (general && gap <= 20 ? 8 : 0) + (woundsLeft(state, unitId) <= 10 ? 3 : 0) - gap * 0.15
    }
    case CODE_BLOOD:
      // Karanak first, then the Claws, then the Flesh Hounds
      return unit.datasheetId.endsWith('claws-of-karanak') ? 2 : unit.datasheetId.endsWith('.karanak') ? 3 : 1
    case CODE_SAVAGERY: {
      if (unit.turn.foughtThisPhase) return -5
      const quarry = khorneQuarryOf(state, player)
      const foes = enemiesInCombat(state, unitId)
      const vip = foes.some((e) => e === quarry || hasKeyword(state, e, 'HERO'))
      return savageryGain(state, unitId) * 0.5 + (hasKeyword(state, unitId, 'HERO') && vip ? 3 : 0)
    }
    case CODE_PACK: {
      // the target the Claws hurt most: low on Health and a Hero first
      const left = woundsLeft(state, unitId)
      return (left <= 8 ? 2 : 0) + (hasKeyword(state, unitId, 'HERO') ? 1 : 0)
    }
    default:
      return null
  }
}

export const khorneHooks: Record<string, EngineCodeHook> = {
  khorneTheQuarry, khorneBloodDrenched, khorneScentOfBlood, khorneSavagery, khorneStalkThePrey, khornePackHunters, khorneSustainedByGore,
  khorneKillingPounce, khorneFuriousBites,
}
