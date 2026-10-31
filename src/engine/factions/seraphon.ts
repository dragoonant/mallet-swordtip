// Seraphon (Sunblooded Prowlers) code hooks: docs/spec/factions/seraphon.md (SER-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/seraphon/abilities.json uses. Activated abilities
// use `activate` (hooks.ts ActivatedAbilityHook, run by abilities.ts, which rolls the descriptor's declared D6 first and only calls
// `resolve` on success); passive rules are declarative descriptors that a code hook gates or answers. What each hook needs from data:
//
//  seraphonVengeanceOfAzyr (BT-2)    army battle trait, end of any turn, no declare step. One D6 per enemy unit in combat with a friendly
//        SAURUS unit (params.succeedOn / params.mortal): on a hit the unit suffers params.mortal mortal damage.
//  seraphonScaledAegis (RA-1)        army regiment ability, hero phase, descriptor roll D6 3+, oncePerTurnArmy. Target = a friendly SAURUS unit;
//        grants { feelNoPain: params.ward } until the start of your next turn.
//  seraphonFollowersOfHuanchi (RA-2) army regiment ability, shooting phase, roll D6 3+, oncePerTurnArmy. Target = a friendly SKINK unit; grants
//        its ranged weapons Crit (Auto-wound) for the turn, Companion weapons included (affectsCompanion).
//  seraphonInstinctiveCommander      hero phase, roll D6 3+. Target = a visible friendly unit wholly within params.range of the general that is
//        not in combat (the general's own unit counts); queues a Normal Move (a slide with normalMove) of the unit's Move.
//  seraphonSavageMauling             any combat phase; target = an enemy unit in combat with the general. Pushes the card flag 'noWard'
//        (cardFlags.cardWard) until the end of the turn.
//  seraphonVenomiteSwarm             any combat phase; needs the general's Venomites token (params.token). Rolls D3: 1 loses the token,
//        2 or 3 is that much mortal damage on the target (an enemy unit in combat with the general).
//  seraphonBlessedByTheOldOnes       end of any turn, whileDestroyed + params.mandatory. The destroyed, not yet replaced general comes back as
//        a one-model Sunblood unit set up anywhere more than params.minEnemyDistance from every enemy (PlaceRequest.anywhere).
//  seraphonScaledProtectors (AB-1)   passive on the Sunblood Pack: ignoresFirstDamagePerPhase while a sunblood model lives, and +params.control to
//        the unit's control score (a battle-long marker effect answers onObjectiveControl).
//  seraphonSavageBellow (AB-2)       hero phase, roll D6 3+; target = a visible friendly unit wholly within params.range (the unit itself too);
//        grants all its weapons Crit (2 Hits) for the turn, Companion weapons included.
//  Ordered Cohorts (AB-3) is a plain descriptor (+1 save while on an objective you control).
//  seraphonStarVenom (AB-4)          any shooting phase, roll D6 2+; target = an enemy unit this unit's shooting damaged this phase; the target's
//        melee attacks get -1 to wound for the turn.
//  seraphonScreeches (AB-5)          any combat phase, roll D6 4+; target = an enemy unit in combat with the Terrawings; its melee attacks get -1
//        to hit for the turn.
//  seraphonSunAcolytes (AB-6)        passive on the Spawn: control score +1 per 'sun-acolyte' token (at most 1 with none left), tokens lost to
//        unmodified save 1s after the Attack ability (afterAttackSequence).
//
//  AI hints: seraphonAbilityTiming / seraphonTargetBonus below are read by src/ai/utility.ts (abilityTiming / abilityTargetBonus).
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { Effect } from '../../data/types'
import type { EngineContext } from '../modules'
import type { GameState, PlayerId, UnitId } from '../types'
import { rollSum } from '../dice'
import { damagedByShootingThisPhase } from '../attack'
import { cardsOf } from '../cards'
import { effectService } from '../effects'
import { losService } from '../los'
import { modelStats, spawnDestroyedUnitCopy } from '../state'
import { EPS } from '../geometry'
import {
  announce, enemiesInCombat, hasKeyword, inCombat, inflictMortal, liveModels, liveObjectives, onBoard, paramOf, paramsByCode, removeTokens, unitContestsObjective,
  unitGap, whollyWithinUnit,
} from './aos-common'
import { writeMoveQueue, writePlaceRequest } from './aos-moves'
import { discardReplacement, replacementOptions } from './spearhead-core'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const CODE_VENGEANCE = 'seraphonVengeanceOfAzyr'
const CODE_AEGIS = 'seraphonScaledAegis'
const CODE_FOLLOWERS = 'seraphonFollowersOfHuanchi'
const CODE_COMMANDER = 'seraphonInstinctiveCommander'
const CODE_MAULING = 'seraphonSavageMauling'
const CODE_VENOMITE = 'seraphonVenomiteSwarm'
const CODE_BLESSED = 'seraphonBlessedByTheOldOnes'
const CODE_PROTECTORS = 'seraphonScaledProtectors'
const CODE_BELLOW = 'seraphonSavageBellow'
const CODE_STAR_VENOM = 'seraphonStarVenom'
const CODE_SCREECHES = 'seraphonScreeches'
const CODE_ACOLYTES = 'seraphonSunAcolytes'

const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}
const unitsOf = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()

const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}

// does the unit still hold a live model of this datasheet model id (the Sunblood)
const hasModel = (state: GameState, unitId: UnitId, modelId: string): boolean => liveModels(state, unitId).some((m) => m.datasheetModelId === modelId)

// puts one battle-long marker effect on every unit that carries an ability with this code (datasheet ability) and has none yet; the
// passive producers below only answer on an ActiveEffect (hooks-impl collect), which is how the control bonuses reach objectives.
// Idempotent; abilities.ts calls ensureEffects at the top of every ability window.
function ensureBattleEffect(ctx: EngineContext, code: string): void {
  const s = ctx.state
  for (const ab of Object.values(s.abilities)) {
    if (ab.code !== code) continue
    for (const unit of Object.values(s.units)) {
      if (unit.location === 'destroyed' || !(s.datasheets[unit.datasheetId]?.abilities ?? []).includes(ab.id)) continue
      if (unit.effects.some((e) => e.sourceAbilityId === ab.id)) continue
      effectService.grant(ctx, unit.id, {}, { sourceAbilityId: ab.id, sourceUnitId: unit.id, scope: { who: 'self' }, duration: 'battle' })
    }
  }
}

// ---------- SER-BT-2 Vengeance of Azyr ----------
// every enemy unit in combat with at least one friendly SAURUS unit (one entry per enemy unit, in unit id order)
const vengeanceTargets = (state: GameState, player: PlayerId): UnitId[] => {
  const out = new Set<UnitId>()
  for (const id of unitsOf(state, player)) if (hasKeyword(state, id, 'SAURUS')) for (const e of enemiesInCombat(state, id)) out.add(e)
  return [...out].sort()
}

const vengeanceActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => vengeanceTargets(state, use.player ?? state.activePlayer).length > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const need = num(paramOf(s, use.abilityId, 'succeedOn', 4), 4)
    const mortal = num(paramOf(s, use.abilityId, 'mortal', 1), 1)
    for (const enemy of vengeanceTargets(s, use.player)) {
      if (!onBoard(s, enemy)) continue
      const roll = rollSum(ctx.roll({ purpose: 'ability', player: use.player, unitId: null, targetUnitId: enemy, commandRerollable: false }))
      if (roll < need) { announce(ctx, use, enemy, `Vengeance of Azyr: rolled ${roll}, ${s.units[enemy].name} is spared`); continue }
      announce(ctx, use, enemy, `Vengeance of Azyr: rolled ${roll}, ${s.units[enemy].name} suffers ${mortal} mortal damage`)
      inflictMortal(ctx, use, enemy, mortal)
    }
  },
}
const seraphonVengeanceOfAzyr: EngineCodeHook = { name: CODE_VENGEANCE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: vengeanceActivate }

// ---------- SER-RA-1 Scaled Aegis ----------
const aegisTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] =>
  unitsOf(state, player ?? state.activePlayer).filter((id) => hasKeyword(state, id, 'SAURUS'))

const aegisActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => pickedOk(aegisTargets(state, null, use.player), use),
  targets: aegisTargets as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const ward = num(paramOf(ctx.state, use.abilityId, 'ward', 6), 6)
    effectService.grant(ctx, target, { feelNoPain: ward }, { sourceAbilityId: use.abilityId, sourceUnitId: null, scope: { who: 'self' }, duration: 'untilNextTurn' })
    announce(ctx, use, target, `Scaled Aegis: ${ctx.state.units[target].name} has Ward (${ward}+) until the start of your next turn`)
  },
}
const seraphonScaledAegis: EngineCodeHook = { name: CODE_AEGIS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: aegisActivate }

// ---------- SER-RA-2 Followers of Huanchi ----------
const followersTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] =>
  unitsOf(state, player ?? state.activePlayer).filter((id) => hasKeyword(state, id, 'SKINK'))

const followersActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => pickedOk(followersTargets(state, null, use.player), use),
  targets: followersTargets as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const effect: Effect = { when: { weaponType: 'ranged' }, grantWeaponAbility: { ability: 'CRIT_AUTO_WOUND' }, affectsCompanion: true }
    effectService.grant(ctx, target, effect, { sourceAbilityId: use.abilityId, sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Followers of Huanchi: the ranged weapons of ${ctx.state.units[target].name} have Crit (Auto-wound) this turn`)
  },
}
const seraphonFollowersOfHuanchi: EngineCodeHook = { name: CODE_FOLLOWERS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: followersActivate }

// ---------- visible friendly units wholly within range of the holder (Savage Bellow, Instinctive Commander) ----------
function visibleFriendsWithin(state: GameState, holderId: UnitId | null, range: number, filter: (id: UnitId) => boolean): UnitId[] {
  const src = onBoard(state, holderId)
  if (!src) return []
  const mine = liveModels(state, src.id)
  return unitsOf(state, src.player).filter((id) => filter(id) && (id === src.id || (whollyWithinUnit(state, id, src.id, range) && mine.some((m) => losService.unitVisible(state, m.id, id)))))
}

// ---------- SER-ENH Instinctive Commander ----------
const commanderTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const range = num(paramsByCode(state, unitId, CODE_COMMANDER).range, 12)
  return visibleFriendsWithin(state, unitId, range, (id) => !inCombat(state, id))
}

const moveOf = (state: GameState, unitId: UnitId): number => Math.max(0, ...liveModels(state, unitId).map((m) => modelStats(state, m).M))

const commanderActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(commanderTargets(state, unitId), use),
  targets: commanderTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target) || inCombat(s, target)) return
    announce(ctx, use, target, `Instinctive Commander: ${s.units[target].name} can make a Normal Move`)
    // approximation: a rigid slide of up to the unit's Move whose straight paths may not enter an enemy combat range (SlideOpts.normalMove)
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: moveOf(s, target), queue: [target], kind: 'slide', opts: { normalMove: true } })
  },
}
const seraphonInstinctiveCommander: EngineCodeHook = { name: CODE_COMMANDER, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: commanderActivate }

// ---------- SER-ENH Savage Mauling ----------
const inCombatWith = (state: GameState, unitId: UnitId | null): UnitId[] => (onBoard(state, unitId) ? enemiesInCombat(state, unitId as UnitId).sort() : [])

const maulingActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(inCombatWith(state, unitId), use),
  targets: inCombatWith,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    // the card-flag table already switches Ward off for a unit (cardFlags.cardWard); 'turn' flags lapse at the end of the turn
    cardsOf(s).flags.push({ kind: 'noWard', source: use.abilityId, player: use.player, unitId: target, objectiveId: null, value: 0, until: 'turn', round: s.round })
    announce(ctx, use, target, `Savage Mauling: ${s.units[target].name} can make no Ward rolls for the rest of the turn`)
  },
}
const seraphonSavageMauling: EngineCodeHook = { name: CODE_MAULING, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: maulingActivate }

// ---------- SER-ENH Venomite Swarm ----------
const venomiteToken = (state: GameState, unitId: UnitId | null): string => {
  const v = unitId ? paramsByCode(state, unitId, CODE_VENOMITE).token : undefined
  return typeof v === 'string' ? v : 'venomites'
}
const hasVenomites = (state: GameState, unitId: UnitId | null): boolean => !!unitId && (state.units[unitId]?.tokens?.[venomiteToken(state, unitId)] ?? 0) > 0

const venomiteActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => hasVenomites(state, unitId) && pickedOk(inCombatWith(state, unitId), use),
  targets: (state, unitId) => (hasVenomites(state, unitId) ? inCombatWith(state, unitId) : []),
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    const src = onBoard(s, use.unitId)
    if (!target || !src || !onBoard(s, target)) return
    const token = venomiteToken(s, src.id)
    if ((src.tokens?.[token] ?? 0) <= 0) return
    const roll = ctx.rollExpr('D3', { purpose: 'ability', player: use.player, unitId: src.id, targetUnitId: target, commandRerollable: false }).total
    if (roll <= 1) {
      removeTokens(ctx, src.id, token)
      announce(ctx, use, target, 'Venomite Swarm: rolled 1, the Venomites scatter and the token is lost')
      return
    }
    announce(ctx, use, target, `Venomite Swarm: rolled ${roll}, ${s.units[target].name} suffers ${roll} mortal damage`)
    inflictMortal(ctx, use, target, roll)
  },
}
const seraphonVenomiteSwarm: EngineCodeHook = { name: CODE_VENOMITE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: venomiteActivate }

// ---------- SER-ENH Blessed by the Old Ones ----------
// the destroyed general that has not been replaced; whileDestroyed makes abilities.ts offer this descriptor for it
const blessedActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => {
    const u = unitId ? state.units[unitId] : undefined
    return !!u && u.location === 'destroyed' && !u.replaced && u.isWarlord && u.replacementOf === null
  },
  resolve(ctx, use) {
    const s = ctx.state
    const orig = use.unitId ? s.units[use.unitId] : undefined
    if (!orig || orig.location !== 'destroyed' || orig.replaced) return
    const minEnemyDistance = num(paramOf(s, use.abilityId, 'minEnemyDistance', 6), 6)
    const shape = { anywhere: true, edgeBand: false, minEnemyDistance }
    const copy = spawnDestroyedUnitCopy(ctx, orig.id, { onlyModels: ['sunblood'] })
    copy.replacementOf = orig.id
    copy.startingStrength = copy.models.length
    orig.replaced = true
    // no room anywhere: nothing comes back and the roll is spent (the ability is tried again at the next turn end)
    if (copy.models.length === 0 || replacementOptions(s, copy.id, shape).length === 0) {
      discardReplacement(s, copy.id)
      announce(ctx, use, null, 'Blessed by the Old Ones: there is no room for the Sunblood to return')
      return
    }
    // RULING: the replacement is the general from now on (it carries no enhancement, so this cannot happen a second time)
    copy.isWarlord = true
    orig.isWarlord = false
    s.players[use.player].warlordUnitId = copy.id
    announce(ctx, use, copy.id, 'Blessed by the Old Ones: the Sunblood returns on its own and takes command')
    writePlaceRequest(s, { abilityId: use.abilityId, player: use.player, unitId: copy.id, replacementOf: orig.id, anywhere: { minEnemyDistance } })
  },
}
const seraphonBlessedByTheOldOnes: EngineCodeHook = {
  name: CODE_BLESSED, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: blessedActivate, whileDestroyed: true,
}

// ---------- SER-AB-1 Scaled Protectors ----------
const seraphonScaledProtectors: EngineCodeHook = {
  name: CODE_PROTECTORS, kind: 'ability', hook: 'onStatQuery', run: noop,
  // the first damage point allocated each phase is ignored while the Sunblood lives (attack.ts asks after the ward rolls)
  ignoresFirstDamagePerPhase(state, entry, unitId) {
    if (entry.active || entry.holderUnitId !== unitId || !onBoard(state, unitId)) return false
    return hasModel(state, unitId, String(entry.params.model ?? 'sunblood'))
  },
  producesAt: ['onObjectiveControl'],
  produce(ctx, entry, data) {
    if (!entry.active || data.contestingUnitId !== entry.holderUnitId) return null
    const ab = ctx.state.abilities[entry.source.id]
    if (!hasModel(ctx.state, entry.holderUnitId, String(ab?.params?.model ?? 'sunblood'))) return null
    return { kind: 'stat', delta: num(ab?.params?.control, 1) }
  },
  ensureEffects: (ctx) => ensureBattleEffect(ctx, CODE_PROTECTORS),
}

// ---------- SER-AB-2 Savage Bellow ----------
const bellowTargets = (state: GameState, unitId: UnitId | null): UnitId[] =>
  visibleFriendsWithin(state, unitId, num(paramsByCode(state, unitId, CODE_BELLOW).range, 12), () => true)

const bellowActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(bellowTargets(state, unitId), use),
  targets: bellowTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const effect: Effect = { grantWeaponAbility: { ability: 'CRIT_2_HITS' }, affectsCompanion: true }
    effectService.grant(ctx, target, effect, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Savage Bellow: the weapons of ${ctx.state.units[target].name} have Crit (2 Hits) this turn`)
  },
}
const seraphonSavageBellow: EngineCodeHook = { name: CODE_BELLOW, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: bellowActivate }

// ---------- SER-AB-4 Star-Venom / SER-AB-5 Nerve-Shredding Screeches ----------
// both hand the target -1 to a roll of its own combat attacks; params.stat says which roll
const debuffGrant = (stat: unknown): Effect => ({ when: { weaponType: 'melee' }, modifyRoll: { roll: stat === 'wound' ? 'wound' : 'hit', value: -1 } })

const starVenomTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const me = onBoard(state, unitId)
  return me ? damagedByShootingThisPhase(state, me.id).filter((id) => !!onBoard(state, id) && state.units[id].player !== me.player).sort() : []
}
const starVenomActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(starVenomTargets(state, unitId), use),
  targets: starVenomTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const stat = paramOf(ctx.state, use.abilityId, 'stat', 'wound')
    effectService.grant(ctx, target, debuffGrant(stat), { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Star-Venom: ${ctx.state.units[target].name} gets -1 to wound with its combat attacks this turn`)
  },
}
const seraphonStarVenom: EngineCodeHook = { name: CODE_STAR_VENOM, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: starVenomActivate }

const screechesActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(inCombatWith(state, unitId), use),
  targets: inCombatWith,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const stat = paramOf(ctx.state, use.abilityId, 'stat', 'hit')
    effectService.grant(ctx, target, debuffGrant(stat), { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Nerve-Shredding Screeches: ${ctx.state.units[target].name} gets -1 to hit with its combat attacks this turn`)
  },
}
const seraphonScreeches: EngineCodeHook = { name: CODE_SCREECHES, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: screechesActivate }

// ---------- SER-AB-6 Sun Acolytes ----------
const seraphonSunAcolytes: EngineCodeHook = {
  name: CODE_ACOLYTES, kind: 'ability', hook: 'onStatQuery', run: noop,
  producesAt: ['onObjectiveControl'],
  produce(ctx, entry, data) {
    if (!entry.active || data.contestingUnitId !== entry.holderUnitId) return null
    const token = String(ctx.state.abilities[entry.source.id]?.params?.token ?? 'sun-acolyte')
    const n = ctx.state.units[entry.holderUnitId]?.tokens?.[token] ?? 0
    return n > 0 ? { kind: 'stat', delta: n } : { kind: 'stat', cap: 1 }
  },
  // each unmodified save of 1 the unit rolled in the Attack ability costs a token, once the whole ability has resolved
  afterAttackSequence(ctx, entry, info) {
    if (entry.active) return
    const ones = info.saveOnes[entry.holderUnitId] ?? 0
    if (ones <= 0) return
    const token = String(entry.params.token ?? 'sun-acolyte')
    removeTokens(ctx, entry.holderUnitId, token, ones)
  },
  ensureEffects: (ctx) => ensureBattleEffect(ctx, CODE_ACOLYTES),
}

export const seraphonHooks: Record<string, EngineCodeHook> = {
  seraphonVengeanceOfAzyr, seraphonScaledAegis, seraphonFollowersOfHuanchi, seraphonInstinctiveCommander, seraphonSavageMauling,
  seraphonVenomiteSwarm, seraphonBlessedByTheOldOnes, seraphonScaledProtectors, seraphonSavageBellow, seraphonStarVenom, seraphonScreeches,
  seraphonSunAcolytes,
}

// ---------------------------------------------------------------------------------------------------------------------------
// AI hints (src/ai/utility.ts calls these; null = no opinion). abilityTiming: added to the "use it" score of an offered ability, a
// value of -3 or less makes the bot pass. targetBonus: added to the score of one candidate target.
// ---------------------------------------------------------------------------------------------------------------------------
const attackCount = (state: GameState, unitId: UnitId, kind: 'melee' | 'ranged'): number => {
  let total = 0
  for (const m of liveModels(state, unitId)) {
    for (const wid of m.weapons) {
      const w = state.weapons[wid]
      if (w && w.kind === kind) total += typeof w.A === 'number' ? w.A : 3.5
    }
  }
  return total
}

// nearest enemy unit gap (inf when none)
function nearestEnemyGap(state: GameState, player: PlayerId, unitId: UnitId): number {
  let best = Infinity
  for (const e of Object.values(state.units)) if (e.player !== player && e.location === 'board') best = Math.min(best, unitGap(state, unitId, e.id))
  return best
}

// the longest ranged weapon a unit carries (0 = none)
const longestRange = (state: GameState, unitId: UnitId): number => {
  let best = 0
  for (const m of liveModels(state, unitId)) for (const wid of m.weapons) {
    const w = state.weapons[wid]
    if (w && w.kind === 'ranged') best = Math.max(best, w.range ?? 0)
  }
  return best
}

// does the unit have, or get this turn, a ward (the enemy side of Savage Mauling)
function hasWard(state: GameState, unitId: UnitId): boolean {
  const u = state.units[unitId]
  if (!u) return false
  if (liveModels(state, unitId).some((m) => modelStats(state, m).ward !== null)) return true
  if (state.datasheets[u.datasheetId]?.coreAbilities.some((c) => c.ability === 'FEEL_NO_PAIN')) return true
  return u.effects.some((e) => (Array.isArray(e.effect) ? e.effect : [e.effect]).some((x) => x.feelNoPain !== undefined))
}

export function seraphonAbilityTiming(state: GameState, player: PlayerId, code: string, unitIdIn: UnitId | null): number | null {
  // the option the bot scores carries no unit hint, and the enhancements all belong to the general
  const unitId = unitIdIn ?? generalOf(state, player)
  switch (code) {
    case CODE_FOLLOWERS: {
      // worth a prompt only when a Skink unit has an enemy inside its gun range
      const ok = followersTargets(state, null, player).some((id) => {
        const reach = longestRange(state, id)
        return reach > 0 && nearestEnemyGap(state, player, id) <= reach + EPS
      })
      return ok ? 0.5 : -3
    }
    case CODE_COMMANDER:
      // free to try whenever a unit is eligible (the failed roll costs nothing but the use)
      return commanderTargets(state, unitId).length > 0 ? 0 : -3
    case CODE_MAULING:
      // only against a unit that actually has a ward
      return inCombatWith(state, unitId).some((id) => hasWard(state, id)) ? 0.5 : -3
    case CODE_VENOMITE:
      return hasVenomites(state, unitId) ? 0 : -3
    case CODE_BELLOW:
      // pointless when nothing it can buff is near an enemy (or about to fight)
      return bellowTargets(state, unitId).some((id) => nearestEnemyGap(state, player, id) <= 12 + EPS) ? 0 : -3
    default:
      return null
  }
}

export function seraphonTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_AEGIS: {
      // the Saurus unit that will be hit first: prefer the general, then whoever stands closest to an enemy
      const gap = nearestEnemyGap(state, player, unitId)
      return (unit.isWarlord ? 1.5 : 0) + (gap < 18 ? (18 - gap) * 0.1 : 0) + (inCombat(state, unitId) ? 1 : 0)
    }
    case CODE_FOLLOWERS: {
      // the Spawn when it can shoot, else the Hunters with the most models in gun range
      const reach = longestRange(state, unitId)
      if (reach <= 0 || nearestEnemyGap(state, player, unitId) > reach + EPS) return -2
      return unit.datasheetId.endsWith('spawn-of-chotec') ? 3 : unit.models.length * 0.4
    }
    case CODE_BELLOW: {
      // the unit about to swing (or shoot) the hardest
      const gap = nearestEnemyGap(state, player, unitId)
      const near = gap <= 12 + EPS ? 1 : 0.25
      return (attackCount(state, unitId, 'melee') + 0.5 * attackCount(state, unitId, 'ranged')) * near * 0.4 + (unit.isWarlord ? 0.2 : 0)
    }
    case CODE_COMMANDER: {
      // Saurus Warriors first, nudged toward an objective nobody on our side holds
      const ds = unit.datasheetId
      const base = ds.endsWith('saurus-warriors') ? 2 : ds.endsWith('sunblood-pack') ? 1 : ds.endsWith('terrawings') ? 0.5 : 0
      return base + (liveObjectives(state).some((o) => unitContestsObjective(state, unitId, o)) ? -1 : 0.5)
    }
    case CODE_MAULING:
      return unit.player !== player ? (hasWard(state, unitId) ? 3 : 0) : null
    case CODE_STAR_VENOM:
    case CODE_SCREECHES:
      // a debuff is worth the most on the unit that swings hardest
      return unit.player !== player ? attackCount(state, unitId, 'melee') * 0.3 : null
    case CODE_VENOMITE:
      return unit.player !== player ? 0.5 : null
    default:
      return null
  }
}
