// Gloomspite Gitz (Snarlpack Huntaz) code hooks: docs/spec/factions/gloomspite-gitz.md (GLO-*). Spread into the registry in
// code-hooks.ts under the `code` names src/data/factions/gloomspite/abilities.json uses. Activated abilities use `activate`
// (hooks.ts ActivatedAbilityHook, run by abilities.ts); passive rules are declarative descriptors that a code hook gates or answers.
// What each hook needs from data:
//
//  Fast as Frazzlegit (BT-1)          plain descriptor: scope self, effect { chargeAfterFallBack, noRetreatDamage } (hooks-impl
//        unitHasEffectFlag reads passive descriptors since F8, so no hook).
//  Flankin' Force (RA-1)              reuses fyreslayersMagmicTunnels (params.round / minEnemyDistance / preferDatasheets / redeployText).
//  gloomspiteFrazzleboom (RA-2)       onOwnModelSlain on the regiment ability; params.range / dice / succeedOn / keyword (WAR MACHINE).
//        v1 auto-picks the enemy unit within range with the fewest wounds left (ties by id). From inside a Fight or Shooting
//        attack sequence the mortal damage is held until that activation has finished (deferMortalAfterFight), otherwise it lands at once.
//  gloomspiteKunnin (ENH-1)           fight window / any, oncePerBattle; params.range / rend. An aura on the bearer's unit read per attack.
//  gloomspiteGlare (ENH-2)            fight window / any, oncePerBattle; target = an enemy unit in combat with the bearer's unit.
//  gloomspiteSunstealaShard (ENH-3)   enemy shooting window, oncePerBattle; params.range. Grants a marker aura; `forbidsShootingTarget`
//        reads it (target wholly within range of the bearer, firing unit not in combat with the target).
//  gloomspiteBackstabba (ENH-4)       end of any turn, no limit; declared roll D3 2+ in data, the roll is the mortal damage.
//  gloomspiteSnarlinHowl (AB-1)       hero phase, oncePerTurnArmy; declared roll D6 3+ in data. Target = another friendly unit within params.range
//        of the Snarlboss. Grants +1 Attacks / +1 Rend on Companion melee weapons to both (Effect.affectsCompanion).
//  gloomspiteIGotDisBoss (AB-2)       passive Ward on the holder (Wolfgit Retinue) and on a friendly params.datasheet unit (Snarlboss)
//        while they are within params.range of each other (closest models, not wholly).
//  Frazzleburned Scrap (AB-3)         plain descriptor (when unitCharged, fightsFirst).
//  gloomspiteCareening (AB-4)         movement phase, params.window 'moveDeclared': offered when the unit has declared its move, in
//        place of that move. Modes are engine-built rigid slides (aos-moves.ts, passThrough + mustEndOutOfCombat), one per crossed
//        enemy Infantry unit when the path crosses any ("hitting X"). Afterwards the declared move is turned into a zero-length
//        Normal Move (moveType 'normal', placements mark written) so phases/movement.ts finishes the unit without a second move.
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { DiceExpr, Effect } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { EPS, distance, dist2D } from '../geometry'
import { attackService, deferMortalAfterFight } from '../attack'
import { readDeclaredMove } from '../declared'
import { rollSum } from '../dice'
import { effectService } from '../effects'
import { hookService } from '../hooks-impl'
import { keywordsOf, modelStats } from '../state'
import { applySlide, parseSlide, slideOptions, unitsPassedAcross } from './aos-moves'
import { announce, enemiesInCombat, hasKeyword, inCombat, inflictMortal, liveModels, onBoard, paramOf, unitGap, unitsWithin, whollyWithinUnit } from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const byFewestWounds = (state: GameState) => (a: UnitId, b: UnitId): number => woundsLeft(state, a) - woundsLeft(state, b) || (a < b ? -1 : 1)
const enemyBoardUnits = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player !== player && u.location === 'board').map((u) => u.id).sort()
const friendlyBoardUnits = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()

// ---------- GLO-RA-2 Frazzleboom ----------
const gloomspiteFrazzleboom: EngineCodeHook = {
  name: 'gloomspiteFrazzleboom', kind: 'ability', hook: 'onModelDestroyed', run: noop,
  onOwnModelSlain(ctx, { ability, unitId, model }) {
    const s = ctx.state
    const kw = typeof ability.params?.keyword === 'string' ? ability.params.keyword : 'WAR MACHINE'
    if (!keywordsOf(s, unitId).includes(kw)) return
    const owner = s.units[unitId].player
    const range = num(ability.params?.range, 3)
    // measured from where the War Machine stood when it was slain (the snapshot), base to base
    const near = enemyBoardUnits(s, owner)
      .filter((e) => liveModels(s, e).some((m) => distance(model, m) <= range + EPS))
      .sort(byFewestWounds(s))
    if (near.length === 0) {
      ctx.emit({ type: 'AbilityTriggered', abilityId: ability.id, sourceUnitId: unitId, targetUnitId: null, summary: `Frazzleboom: no enemy unit within ${range}"`, player: owner })
      return
    }
    const target = near[0]
    const dice = paramOf<DiceExpr>(s, ability.id, 'dice', 'D3')
    const need = num(ability.params?.succeedOn, 2)
    const roll = ctx.rollExpr(dice, { purpose: 'ability', player: owner, unitId, targetUnitId: target, commandRerollable: false }).total
    const hit = roll >= need
    const inSequence = !!s.phaseState.attack && (s.phase === 'fight' || s.phase === 'shooting')
    ctx.emit({
      type: 'AbilityTriggered', abilityId: ability.id, sourceUnitId: unitId, targetUnitId: target, player: owner,
      summary: hit ? `Frazzleboom: rolled ${roll}, ${roll} mortal damage${inSequence ? ' once the attack has finished' : ''}` : `Frazzleboom: rolled ${roll}, the blast fizzles`,
    })
    if (!hit) return
    if (inSequence) deferMortalAfterFight(s, { targetUnitId: target, count: roll, source: ability.id, player: owner })
    else attackService.queueMortalWounds(ctx, target, roll, ability.id, false)
  },
}

// ---------- GLO-ENH-1 Kunnin' as a Snarlfang ----------
const kunninActivate: ActivatedAbilityHook = {
  // worth offering only when somebody the aura would cover is in combat (nothing stops a player passing anyway)
  canUse(state, unitId, use) {
    const src = onBoard(state, unitId)
    if (!src) return false
    const range = num(paramOf(state, use.abilityId ?? '', 'range', 12), 12)
    return friendlyBoardUnits(state, src.player).some((id) => (id === src.id || whollyWithinUnit(state, id, src.id, range)) && inCombat(state, id))
  },
  resolve(ctx, use) {
    const src = onBoard(ctx.state, use.unitId)
    if (!src) return
    const range = num(paramOf(ctx.state, use.abilityId, 'range', 12), 12)
    const rend = num(paramOf(ctx.state, use.abilityId, 'rend', 1), 1)
    // AP is the negative of Rend. Companion weapons are skipped by the engine (CORE-12.4): the effect does not carry affectsCompanion
    const effect: Effect = { when: { weaponType: 'melee' }, modifyStat: { stat: 'AP', value: -rend } }
    effectService.grant(ctx, src.id, effect, { sourceAbilityId: use.abilityId, sourceUnitId: src.id, scope: { who: 'friendly', within: range, wholly: true }, duration: 'untilEndOfTurn' })
    announce(ctx, use, null, `Kunnin' as a Snarlfang: friendly units wholly within ${range}" have +${rend} Rend on their melee weapons for the rest of the turn`)
  },
}
const gloomspiteKunnin: EngineCodeHook = { name: 'gloomspiteKunnin', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: kunninActivate }

// ---------- GLO-ENH-2 Glare of Frazzlegit ----------
const glareTargets = (state: GameState, unitId: UnitId | null): UnitId[] => (onBoard(state, unitId) ? enemiesInCombat(state, unitId as UnitId).sort() : [])

const glareActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const targets = glareTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: glareTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const value = num(paramOf(ctx.state, use.abilityId, 'hitModifier', -1), -1)
    effectService.grant(ctx, target, { modifyRoll: { roll: 'hit', value } }, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Glare of Frazzlegit: ${ctx.state.units[target].name} has ${value} to its hit rolls for the rest of the turn`)
  },
}
const gloomspiteGlare: EngineCodeHook = { name: 'gloomspiteGlare', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: glareActivate }

// ---------- GLO-ENH-3 Sunsteala Shard ----------
const hasRanged = (state: GameState, unitId: UnitId): boolean => liveModels(state, unitId).some((m) => m.weapons.some((w) => state.weapons[w]?.kind === 'ranged'))

const shardActivate: ActivatedAbilityHook = {
  // offered only while the enemy has something that shoots (it is the enemy's phase, so nothing else tells us it is useful)
  canUse(state, unitId) {
    const src = onBoard(state, unitId)
    return !!src && enemyBoardUnits(state, src.player).some((id) => hasRanged(state, id))
  },
  resolve(ctx, use) {
    const src = onBoard(ctx.state, use.unitId)
    if (!src) return
    const range = num(paramOf(ctx.state, use.abilityId, 'range', 6), 6)
    // a marker aura on the bearer: it travels with him, and forbidsShootingTarget reads who is inside it at every target pick
    effectService.grant(ctx, src.id, {}, { sourceAbilityId: use.abilityId, sourceUnitId: src.id, scope: { who: 'friendly', within: range, wholly: true }, duration: 'untilEndOfTurn' })
    announce(ctx, use, null, `Sunsteala Shard: friendly units wholly within ${range}" cannot be shot at this turn, except by units in combat with them`)
  },
}
const gloomspiteSunstealaShard: EngineCodeHook = {
  name: 'gloomspiteSunstealaShard', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: shardActivate,
  forbidsShootingTarget(state, entry, firingUnitId, targetUnitId) {
    if (!entry.active) return false
    const holder = onBoard(state, entry.holderUnitId)
    const target = onBoard(state, targetUnitId)
    if (!holder || !target || target.player !== holder.player || onBoard(state, firingUnitId)?.player === holder.player) return false
    const range = num(entry.active.scope.within, num(entry.params.range, 6))
    if (target.id !== holder.id && !whollyWithinUnit(state, target.id, holder.id, range)) return false
    return !enemiesInCombat(state, firingUnitId).includes(target.id)
  },
}

// ---------- GLO-ENH-4 Devious Backstabba ----------
const backstabbaTargets = (state: GameState, unitId: UnitId | null): UnitId[] =>
  onBoard(state, unitId) ? enemiesInCombat(state, unitId as UnitId).filter((e) => hasKeyword(state, e, 'HERO')).sort() : []

const backstabbaActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const targets = backstabbaTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: backstabbaTargets,
  // abilities.ts rolled the declared D3 and only calls resolve when it was 2+: the roll is the damage
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const dmg = use.roll ? rollSum(use.roll) : ctx.rollExpr('D3', { purpose: 'ability', player: use.player, unitId: use.unitId, targetUnitId: target, commandRerollable: false }).total
    announce(ctx, use, target, `Devious Backstabba: ${dmg} mortal damage`)
    inflictMortal(ctx, use, target, dmg)
  },
}
const gloomspiteBackstabba: EngineCodeHook = { name: 'gloomspiteBackstabba', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: backstabbaActivate }

// ---------- GLO-AB-1 Great Snarlin' Howl ----------
const howlTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const range = num(Object.values(state.abilities).find((a) => a.code === 'gloomspiteSnarlinHowl')?.params?.range, 3)
  return friendlyBoardUnits(state, src.player).filter((id) => id !== src.id && unitsWithin(state, src.id, id, range))
}

const howlActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const targets = howlTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: howlTargets,
  resolve(ctx, use) {
    const src = onBoard(ctx.state, use.unitId)
    const target = use.targetUnitIds[0]
    if (!src || !target || !onBoard(ctx.state, target)) return
    const attacks = num(paramOf(ctx.state, use.abilityId, 'extraAttacks', 1), 1)
    const rend = num(paramOf(ctx.state, use.abilityId, 'extraRend', 1), 1)
    // the one buff that names Companion weapons: affectsCompanion lets the modifier through CORE-12.4, `when` keeps it to them
    const when = { weaponType: 'melee' as const, weaponAbility: 'COMPANION' as const }
    const effects: Effect[] = [
      { when, modifyStat: { stat: 'A', value: attacks }, affectsCompanion: true },
      { when, modifyStat: { stat: 'AP', value: -rend }, affectsCompanion: true },
    ]
    for (const id of [src.id, target]) {
      effectService.grant(ctx, id, effects, { sourceAbilityId: use.abilityId, sourceUnitId: src.id, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    }
    announce(ctx, use, target, `Great Snarlin' Howl: ${src.name} and ${ctx.state.units[target].name} have +${attacks} Attacks and +${rend} Rend on their Companion melee weapons for the rest of the turn`)
  },
}
const gloomspiteSnarlinHowl: EngineCodeHook = { name: 'gloomspiteSnarlinHowl', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: howlActivate }

// ---------- GLO-AB-2 I Got Dis, Boss ----------
const gloomspiteIGotDisBoss: EngineCodeHook = {
  name: 'gloomspiteIGotDisBoss', kind: 'ability', hook: 'onStatQuery', run: noop,
  adjustFeelNoPain(state, entry, modelId, current) {
    const model = state.models[modelId]
    const holder = onBoard(state, entry.holderUnitId)
    if (!model || !holder) return null
    const range = num(entry.params.range, 3)
    const wanted = entry.params.datasheet
    const bosses = friendlyBoardUnits(state, holder.player).filter((id) => id !== holder.id && state.units[id].datasheetId === wanted)
    // the holder's own models need some Snarlboss in range; a Snarlboss's models need to be in range of the holder
    const covered = model.unitId === holder.id
      ? bosses.some((b) => unitsWithin(state, holder.id, b, range))
      : bosses.includes(model.unitId) && unitsWithin(state, holder.id, model.unitId, range)
    if (!covered) return null
    return { threshold: Math.min(current ?? 7, num(entry.params.ward, 5)), modifier: 0 }
  },
}

// ---------- GLO-AB-4 Careening Destruction ----------
const CODE_CAREENING = 'gloomspiteCareening'
const CAREEN_OPTS = { passThrough: true, mustEndOutOfCombat: true } as const
const HIT = '|'

const setUpThisTurn = (state: GameState, unitId: UnitId): boolean => {
  const u = state.units[unitId]
  return !!u && (u.turn.arrivedThisTurn || (u.setUpTurn !== null && u.setUpTurn.round === state.round && u.setUpTurn.player === state.activePlayer))
}

// the unit's Move characteristic (the shortest of its models', Run bonuses never apply)
function careeningDistance(state: GameState, unitId: UnitId): number {
  const moves = liveModels(state, unitId).map((m) => hookService.statFor ? hookService.statFor(state, { unitId, modelId: m.id, weapon: null, stat: 'M' }, modelStats(state, m).M) : modelStats(state, m).M)
  return moves.length > 0 ? Math.min(...moves) : 0
}

const unitCentre = (state: GameState, unitId: UnitId): { x: number; z: number } | null => {
  const ms = liveModels(state, unitId)
  return ms.length === 0 ? null : { x: ms.reduce((a, m) => a + m.pos.x, 0) / ms.length, z: ms.reduce((a, m) => a + m.pos.z, 0) / ms.length }
}

interface CareenMode { id: string; label: string; score: number; hit: UnitId | null }

// every legal heading, one entry per crossed enemy Infantry unit when the path crosses any, best first
export function careeningModes(state: GameState, unitId: UnitId): CareenMode[] {
  const unit = onBoard(state, unitId)
  if (!unit) return []
  const dist = careeningDistance(state, unitId)
  const from = unitCentre(state, unitId)
  const goals = Object.values(state.objectives).filter((o) => !o.removed && o.controller !== unit.player)
  const nearestGoal = (p: { x: number; z: number }): number => goals.length ? Math.min(...goals.map((o) => dist2D(p, o.pos))) : 0
  const before = from ? nearestGoal(from) : 0
  const out: CareenMode[] = []
  for (const opt of slideOptions(state, unitId, dist, CAREEN_OPTS)) {
    const slide = parseSlide(opt.id)
    if (!slide || (Math.abs(slide.dx) < 1e-6 && Math.abs(slide.dz) < 1e-6)) continue
    const progress = from ? before - nearestGoal({ x: from.x + slide.dx, z: from.z + slide.dz }) : 0
    const crossed = unitsPassedAcross(state, unitId, slide.dx, slide.dz).filter((id) => hasKeyword(state, id, 'INFANTRY'))
    if (crossed.length === 0) out.push({ id: opt.id, label: opt.label, score: progress * 0.25, hit: null })
    // D3 mortal damage averages 2: worth more against a unit it can kill, and against the units nearest to dying
    else for (const t of crossed) out.push({ id: `${opt.id}${HIT}${t}`, label: `${opt.label}, hitting ${state.units[t].name}`, score: progress * 0.25 + 2 + (woundsLeft(state, t) <= 2 ? 1 : 0), hit: t })
  }
  return out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
}

// the AI's test for "worth using instead of an ordinary move": it gets the unit out of combat, or it hurts an Infantry unit
export function careeningWorthIt(state: GameState, unitId: UnitId): boolean {
  if (inCombat(state, unitId)) return true
  return careeningModes(state, unitId).some((m) => m.hit !== null)
}

const careeningActivate: ActivatedAbilityHook & { modesFor?(state: GameState, unitId: UnitId | null, player: PlayerId): { id: string; label: string }[] } = {
  canUse(state, unitId) {
    const unit = onBoard(state, unitId)
    const declared = readDeclaredMove(state)
    if (!unit || !declared || declared.unitId !== unit.id || setUpThisTurn(state, unit.id)) return false
    return careeningModes(state, unit.id).length > 0
  },
  modesFor: (state, unitId) => (unitId ? careeningModes(state, unitId).map((m) => ({ id: m.id, label: m.label })) : []),
  resolve(ctx, use) {
    const s = ctx.state
    const unit = onBoard(s, use.unitId)
    if (!unit || !use.modeId) return
    const [moveId, targetId] = use.modeId.split(HIT)
    const slide = parseSlide(moveId)
    if (!slide) return
    if (!applySlide(ctx, unit.id, slide.dx, slide.dz, careeningDistance(s, unit.id), CAREEN_OPTS)) {
      announce(ctx, use, null, `Careening Destruction: ${unit.name} cannot make that move`)
      return
    }
    // it is this unit's move for the phase, and not a Retreat: the declared move becomes a zero-length Normal Move, so the movement
    // phase (which carries on to its 'move' step after this window) finds its placements ready and finishes the unit
    for (const id of unit.models) if (s.units[unit.id] && s.models[id]) s.units[unit.id].turn.moveType = 'normal'
    const placements = liveModels(s, unit.id).map((m) => ({ modelId: m.id, pos: { ...m.pos }, facing: m.facing }))
    s.phaseState.marks = s.phaseState.marks.filter((x) => !x.startsWith('mv:placements='))
    s.phaseState.marks.push(`mv:placements=${JSON.stringify(placements)}`)
    announce(ctx, use, null, `Careening Destruction: ${unit.name} rolls ${Math.round(Math.hypot(slide.dx, slide.dz) * 10) / 10}" across the battlefield`)
    if (targetId && onBoard(s, targetId)) {
      const dice = paramOf<DiceExpr>(s, use.abilityId, 'mortal', 'D3')
      const dmg = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: unit.id, targetUnitId: targetId, commandRerollable: false }).total
      announce(ctx, use, targetId, `Careening Destruction: ${s.units[targetId].name} is run down for ${dmg} mortal damage`)
      inflictMortal(ctx, use, targetId, dmg)
    }
  },
}
const gloomspiteCareening: EngineCodeHook = { name: CODE_CAREENING, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: careeningActivate }

// ---------- AI hints (src/ai/utility.ts calls these; see the notes at the top of the file) ----------
// GLO-BT-1: a unit that can Retreat for free and still charge. The AI scores "pull out, charge back in" as a move of its own
// (fresh Strike-first and Charge bonuses), which a plain Retreat never is.
export function retreatsAndCharges(state: GameState, unitId: UnitId): boolean {
  return !!hookService.unitHasEffectFlag && hookService.unitHasEffectFlag(state, unitId, 'chargeAfterFallBack') && hookService.unitHasEffectFlag(state, unitId, 'noRetreatDamage')
}

// when an offered ability is better saved or skipped: added to the "use it" score (null = no opinion, 0 = use whenever offered,
// below -2 the bot passes). Careening Destruction replaces the unit's ordinary free-placement move with a rigid slide, so it is
// only worth it to get out of combat or to run down Infantry. The Shard is a once-per-battle shield: wait for a shot that matters.
export function gloomspiteAbilityTiming(state: GameState, _player: PlayerId, code: string, unitId: UnitId | null): number | null {
  if (code === CODE_CAREENING) {
    const declared = readDeclaredMove(state)
    return declared && careeningWorthIt(state, declared.unitId) ? 0 : -3
  }
  if (code === 'gloomspiteSunstealaShard') {
    const bearer = onBoard(state, unitId)
    if (!bearer) return null
    const covered = friendlyBoardUnits(state, bearer.player).filter((id) => id === bearer.id || whollyWithinUnit(state, id, bearer.id, 6))
    const shot = enemyBoardUnits(state, bearer.player).some((e) => {
      const reach = Math.max(0, ...liveModels(state, e).flatMap((m) => m.weapons.map((w) => (state.weapons[w]?.kind === 'ranged' ? state.weapons[w].range : 0))))
      return reach > 0 && covered.some((c) => !enemiesInCombat(state, e).includes(c) && unitGap(state, e, c) <= reach + 12)
    })
    return shot ? 0 : -3
  }
  return null
}

export const gloomspiteHooks: Record<string, EngineCodeHook> = {
  gloomspiteFrazzleboom, gloomspiteKunnin, gloomspiteGlare, gloomspiteSunstealaShard, gloomspiteBackstabba,
  gloomspiteSnarlinHowl, gloomspiteIGotDisBoss, gloomspiteCareening,
}
