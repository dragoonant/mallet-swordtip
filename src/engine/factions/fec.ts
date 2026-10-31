// Flesh-eater Courts (Carrion Retainers) code hooks: docs/spec/factions/flesh-eater-courts.md (FEC-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/fec/abilities.json uses. What each hook needs from data:
//
//  Ledger: mission.custom.fecDeeds { [heroUnitId]: 0..6 } is each Hero's noble deeds tally (deedsOf / addDeeds / spendDeeds). A Hero that is
//        off the board reads 0. mission.custom.fecFeast { [unitId]: '<round>:<player>' } remembers the turn in which a unit slew a model.
//  fecNobleDeeds (BT-1)               battle trait marker. `onOwnFightResolved` (attack.ts) adds the damage points the Hero's Fight allocated
//        (after wards) to its tally, capped at 6. `onEnemyModelSlain` records the kill for Victory Feast (activated descriptors are not
//        source entries, so the passive battle trait carries it for every unit).
//  fecSummonLoyalSubjects (BT-2)      movement / your, UNLIMITED (the hook enforces "once per phase per Hero" with the phase mark
//        `fec:summoned:<heroId>`), declares the spending Hero. `modesFor` lists every split of the Hero's points between the Knights
//        (params.knightsCost each) and the Cryptguard (params.cryptguardCost each) within params.range; resolve spends points only for the
//        models actually returned.
//  fecFeedingFrenzy (BT-3)            descriptor { melee +1 A }; the gate keeps it live while a friendly Hero holds exactly 6 points and the
//        holder unit is wholly within params.range of it. One descriptor per unit, so several 6-point Heroes never stack.
//  fecDerangedTransformation (AB-1)   a Spell (castingValue in data); target = a visible friendly unit wholly within params.range of the
//        Archregent (itself included); grants params.grant until the start of your next turn. Also shows the Archregent's deeds in the HUD.
//  fecVictoryFeast (AB-4)             end of any turn; usable once the unit slew a model that turn. Heals params.heal, then queues the free
//        Retreat (no mortal damage) when the unit is in combat. Also shows the Varghulf's deeds in the HUD.
//  fecUlguanCloak (ENH-1)             passive; `ensureEffects` keeps a battle-long { hiddenBeyond } effect on the bearer's unit (los.ts reads it).
//  fecBloodRiverChalice (ENH-2)       oncePerBattle, hero phase; heals params.heal on the general.
//  fecRousingOration (ENH-3)          hero phase; one D6 per other friendly unit wholly within params.range of the general, each 5+ is a point.
//  fecCrimsonVictuals (ENH-4)         a Spell; target = a visible enemy unit within params.range; D3 mortal damage, then the Cryptguard within
//        params.returnRange of the target (measured before the damage) get back one model per damage point allocated.
//  Crusading Army, Defenders of the Realm, Royal Bodyguard and Predator's Pounce are data only.
//
//  AI hints: fecAbilityTiming / fecTargetBonus / fecModeBonus below are read by src/ai/utility.ts.
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook, FactionResource } from '../code-hooks'
import type { DiceExpr, Effect } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import type { EngineContext } from '../modules'
import { EPS } from '../geometry'
import { diceExprMean } from '../dice'
import { effectService } from '../effects'
import { hookService } from '../hooks-impl'
import { losService } from '../los'
import { boardUnitsOf, modelStats } from '../state'
import {
  announce, hasKeyword, healUnit, inCombat, inflictMortal, isDamaged, liveModels, liveObjectives, onBoard, paramOf, returnSlainModels, returnableModels,
  unitGap, whollyWithinUnit,
} from './aos-common'
import { retreatOptions, writeMoveQueue } from './aos-moves'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

const CODE_DEEDS = 'fecNobleDeeds'
const CODE_SUMMON = 'fecSummonLoyalSubjects'
const CODE_FRENZY = 'fecFeedingFrenzy'
const CODE_DERANGED = 'fecDerangedTransformation'
const CODE_FEAST = 'fecVictoryFeast'
const CODE_CLOAK = 'fecUlguanCloak'
const CODE_CHALICE = 'fecBloodRiverChalice'
const CODE_ORATION = 'fecRousingOration'
const CODE_CRIMSON = 'fecCrimsonVictuals'

const AB_DEEDS = 'fec.ability.noble-deeds'
const AB_SUMMON = 'fec.ability.summon-loyal-subjects'
const DS_CRYPTGUARD = 'fec.unit.cryptguard'
const DS_KNIGHTS = 'fec.unit.morbheg-knights'

const LEDGER = 'fecDeeds'
const FEAST = 'fecFeast'
export const MAX_DEEDS = 6

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
const ofDatasheet = (state: GameState, player: PlayerId, datasheetId: string): UnitId[] =>
  unitsOf(state, player).filter((id) => state.units[id].datasheetId === datasheetId)
const heroesOf = (state: GameState, player: PlayerId): UnitId[] => unitsOf(state, player).filter((id) => hasKeyword(state, id, 'HERO'))
const moveOf = (state: GameState, unitId: UnitId): number =>
  Math.max(0, ...liveModels(state, unitId).map((m) => hookService.statFor(state, { unitId, modelId: m.id, weapon: null, stat: 'M' }, modelStats(state, m).M)))

// ---------- the noble deeds ledger (FEC-BT-1) ----------
const ledger = (state: GameState): Record<UnitId, number> => (state.mission.custom[LEDGER] as Record<UnitId, number> | undefined) ?? {}

/** the Hero's noble deeds points (0 once it is off the battlefield: a destroyed Hero loses its tally) */
export const deedsOf = (state: GameState, unitId: UnitId): number => (onBoard(state, unitId) ? ledger(state)[unitId] ?? 0 : 0)

function setDeeds(state: GameState, unitId: UnitId, n: number): void {
  state.mission.custom = { ...state.mission.custom, [LEDGER]: { ...ledger(state), [unitId]: Math.max(0, Math.min(MAX_DEEDS, n)) } }
}

/** gives the Hero `n` points (clamped to 6, the excess is lost); returns the points actually gained */
export function addDeeds(ctx: EngineContext, unitId: UnitId, n: number): number {
  const s = ctx.state
  const unit = onBoard(s, unitId)
  if (!unit || n <= 0) return 0
  const before = deedsOf(s, unitId)
  setDeeds(s, unitId, before + n)
  const after = deedsOf(s, unitId)
  ctx.emit({ type: 'AbilityTriggered', abilityId: AB_DEEDS, sourceUnitId: unitId, targetUnitId: unitId, summary: `Noble deeds: ${unit.name} now has ${after}/${MAX_DEEDS}`, player: unit.player })
  return after - before
}

/** takes `n` points off the Hero's tally */
export function spendDeeds(state: GameState, unitId: UnitId, n: number): void {
  setDeeds(state, unitId, deedsOf(state, unitId) - n)
}

const turnKey = (state: GameState): string => `${state.round}:${state.activePlayer}`
const feastLedger = (state: GameState): Record<UnitId, string> => (state.mission.custom[FEAST] as Record<UnitId, string> | undefined) ?? {}
const slewThisTurn = (state: GameState, unitId: UnitId): boolean => feastLedger(state)[unitId] === turnKey(state)

// ---------- FEC-BT-1 Noble Deeds ----------
const fecNobleDeeds: EngineCodeHook = {
  name: CODE_DEEDS, kind: 'ability', hook: 'onStatQuery', run: noop,
  onOwnFightResolved(ctx, { unitId, damageAllocated }) {
    const s = ctx.state
    // a Hero destroyed in its own Fight has no tally to add to
    if (damageAllocated <= 0 || !onBoard(s, unitId) || !hasKeyword(s, unitId, 'HERO')) return
    addDeeds(ctx, unitId, damageAllocated)
  },
  // attack.ts asks every source held by the slaying unit; this passive trait sits on every unit of the army (Victory Feast needs the kill)
  onEnemyModelSlain(ctx, entry) {
    const s = ctx.state
    s.mission.custom = { ...s.mission.custom, [FEAST]: { ...feastLedger(s), [entry.holderUnitId]: turnKey(s) } }
  },
}

// ---------- FEC-BT-3 Feeding Frenzy ----------
const frenzyHeroes = (state: GameState, holderId: UnitId, player: PlayerId, range: number, points: number): UnitId[] =>
  heroesOf(state, player).filter((h) => deedsOf(state, h) >= points && whollyWithinUnit(state, holderId, h, range))

const fecFeedingFrenzy: EngineCodeHook = {
  name: CODE_FRENZY, kind: 'ability', hook: 'onStatQuery', run: noop,
  gate(state, holder, entry) {
    if (holder.location !== 'board') return false
    return frenzyHeroes(state, holder.id, holder.player, num(entry.params.range, 12), num(entry.params.points, MAX_DEEDS)).length > 0
  },
}

// ---------- FEC-BT-2 Summon Loyal Subjects ----------
const summonedMark = (heroId: UnitId): string => `fec:summoned:${heroId}`
const summonRange = (state: GameState): number => num(paramOf(state, AB_SUMMON, 'range', 9), 9)
const costOf = (state: GameState, key: 'cryptguardCost' | 'knightsCost'): number => Math.max(1, num(paramOf(state, AB_SUMMON, key, key === 'knightsCost' ? 2 : 1), key === 'knightsCost' ? 2 : 1))

// the friendly units of a datasheet within range of the Hero that have slain models to get back
const returnables = (state: GameState, hero: UnitId, datasheetId: string): UnitId[] => {
  const me = onBoard(state, hero)
  if (!me) return []
  const range = summonRange(state)
  return ofDatasheet(state, me.player, datasheetId).filter((id) => returnableModels(state, id) > 0 && unitGap(state, hero, id) <= range + EPS)
}
const roomOf = (state: GameState, ids: UnitId[]): number => ids.reduce((n, id) => n + returnableModels(state, id), 0)

interface Split { k: number; c: number; points: number }

// every (Knights, Cryptguard) split the Hero's points allow, best first (the most Health back, then the fewest points spent)
export function summonSplits(state: GameState, hero: UnitId): Split[] {
  const d = deedsOf(state, hero)
  const kCost = costOf(state, 'knightsCost'), cCost = costOf(state, 'cryptguardCost')
  const kRoom = roomOf(state, returnables(state, hero, DS_KNIGHTS)), cRoom = roomOf(state, returnables(state, hero, DS_CRYPTGUARD))
  const out: Split[] = []
  for (let k = 0; k <= Math.min(kRoom, Math.floor(d / kCost)); k++) {
    for (let c = 0; c <= Math.min(cRoom, Math.floor((d - k * kCost) / cCost)); c++) {
      if (k + c > 0) out.push({ k, c, points: k * kCost + c * cCost })
    }
  }
  return out.sort((a, b) => (b.k * 4 + b.c) - (a.k * 4 + a.c) || a.points - b.points)
}

const modeId = (k: number, c: number): string => `k${k}c${c}`
const parseMode = (id: string | null): { k: number; c: number } | null => {
  const m = id ? /^k(\d+)c(\d+)$/.exec(id) : null
  return m ? { k: Number(m[1]), c: Number(m[2]) } : null
}
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

function summonTargets(state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] {
  const p = player ?? state.activePlayer
  return heroesOf(state, p).filter((h) => deedsOf(state, h) > 0 && !state.phaseState.marks.includes(summonedMark(h)) && summonSplits(state, h).length > 0)
}

const summonActivate: ActivatedAbilityHook & { targets: typeof summonTargets } = {
  canUse: (state, unitId, use) => pickedOk(summonTargets(state, unitId, playerOf(state, use)), use),
  targets: summonTargets,
  modesFor(state, _unitId, _player, targetUnitIds) {
    const hero = targetUnitIds?.[0]
    if (!hero) return []
    return summonSplits(state, hero).map(({ k, c, points }) => ({
      id: modeId(k, c),
      label: `${[k > 0 ? `${plural(k, 'Morbheg Knight', 'Morbheg Knights')}` : '', c > 0 ? `${plural(c, 'Cryptguard', 'Cryptguard')}` : ''].filter(Boolean).join(' and ')} back (${plural(points, 'point', 'points')})`,
    }))
  },
  resolve(ctx, use) {
    const s = ctx.state
    const hero = onBoard(s, use.targetUnitIds[0])
    const want = parseMode(use.modeId)
    if (!hero || !want) return
    const kCost = costOf(s, 'knightsCost'), cCost = costOf(s, 'cryptguardCost')
    let points = deedsOf(s, hero.id)
    let spent = 0
    let knights = 0, guards = 0
    let kLeft = Math.min(want.k, Math.floor(points / kCost))
    for (const id of returnables(s, hero.id, DS_KNIGHTS)) {
      if (kLeft <= 0) break
      const got = returnSlainModels(ctx, id, kLeft, use.abilityId)
      kLeft -= got; knights += got; spent += got * kCost
    }
    points -= spent
    let cLeft = Math.min(want.c, Math.floor(points / cCost))
    for (const id of returnables(s, hero.id, DS_CRYPTGUARD)) {
      if (cLeft <= 0) break
      const got = returnSlainModels(ctx, id, cLeft, use.abilityId)
      cLeft -= got; guards += got; spent += got * cCost
    }
    spendDeeds(s, hero.id, spent)
    s.phaseState.marks.push(summonedMark(hero.id))
    announce(ctx, use, hero.id, `Summon Loyal Subjects: ${hero.name} spends ${plural(spent, 'point', 'points')} (${deedsOf(s, hero.id)} left) to return ${plural(knights, 'Morbheg Knight', 'Morbheg Knights')} and ${plural(guards, 'Cryptguard', 'Cryptguard')}`)
  },
}
const fecSummonLoyalSubjects: EngineCodeHook = { name: CODE_SUMMON, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: summonActivate }

// ---------- the HUD readout of a Hero's tally (carried by the Hero's own warscroll code) ----------
function deedsReadout(label: string): EngineCodeHook['resourceReadout'] {
  return (state, ability, player): FactionResource | null => {
    const hero = unitsOf(state, player).find((id) => (state.datasheets[state.units[id].datasheetId]?.abilities ?? []).includes(ability.id))
    if (!hero) return null
    return {
      id: `fec.deeds.${hero}`, label, value: deedsOf(state, hero), max: MAX_DEEDS,
      help: 'Noble deeds points: damage this Hero allocates in a Fight. At 6, units wholly within 12" of it add 1 to the Attacks of their melee weapons (Feeding Frenzy). Spend them in your movement phase to bring back slain models.',
    }
  }
}

// ---------- FEC-AB-1 Deranged Transformation ----------
function derangedTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramOf(state, 'fec.ability.deranged-transformation', 'range', 18), 18)
  const mine = liveModels(state, me.id)
  return unitsOf(state, me.player).filter((id) => whollyWithinUnit(state, id, me.id, range) && (id === me.id || mine.some((m) => losService.unitVisible(state, m.id, id))))
}
const derangedActivate: ActivatedAbilityHook & { targets: typeof derangedTargets } = {
  canUse: (state, unitId, use) => pickedOk(derangedTargets(state, unitId), use),
  targets: derangedTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    const ab = s.abilities[use.abilityId]
    if (!target || !ab) return
    effectService.grant(ctx, target.id, (ab.params?.grant ?? []) as Effect[], {
      sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: ab.duration ?? 'untilNextTurn',
    })
    announce(ctx, use, target.id, `Deranged Transformation: ${target.name} adds 2" to its Move and 1 to its wound rolls until your next turn`)
  },
}
const fecDerangedTransformation: EngineCodeHook = {
  name: CODE_DERANGED, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: derangedActivate,
  resourceReadout: deedsReadout('Archregent deeds'),
}

// ---------- FEC-AB-4 Victory Feast ----------
const feastActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!unitId && !!onBoard(state, unitId) && slewThisTurn(state, unitId),
  resolve(ctx, use) {
    const s = ctx.state
    const me = onBoard(s, use.unitId)
    if (!me) return
    // the privilege is spent: one Feast per kill streak
    const { [me.id]: _spent, ...rest } = feastLedger(s)
    s.mission.custom = { ...s.mission.custom, [FEAST]: rest }
    const n = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'heal', 'D6'), { purpose: 'ability', player: use.player, unitId: me.id, commandRerollable: false }).total
    const healed = healUnit(ctx, me.id, n, use.abilityId)
    // the core Retreat needs a unit in combat; applyRetreat deals no mortal damage and the options include "stay"
    const retreat = inCombat(s, me.id) && retreatOptions(s, me.id, moveOf(s, me.id)).some((o) => o.id !== 'mv:0:0')
    if (retreat) {
      writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: moveOf(s, me.id), queue: [me.id], kind: 'retreat' })
      me.turn.moveType = 'fallBack'
    }
    announce(ctx, use, me.id, `Victory Feast: ${me.name} rolls ${n} and heals ${healed}${retreat ? ', then may Retreat with no mortal damage' : ''}`)
  },
}
const fecVictoryFeast: EngineCodeHook = {
  name: CODE_FEAST, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: feastActivate,
  resourceReadout: deedsReadout('Varghulf deeds'),
}

// ---------- FEC-ENH-1 Ulguan Cloak ----------
const fecUlguanCloak: EngineCodeHook = {
  name: CODE_CLOAK, kind: 'ability', hook: 'onStatQuery', run: noop,
  // los.ts reads { hiddenBeyond } off unit.effects, so the passive cloak is kept there as a battle-long effect (idempotent)
  ensureEffects(ctx) {
    const s = ctx.state
    for (const ab of Object.values(s.abilities)) {
      if (ab.code !== CODE_CLOAK || ab.source !== 'enhancement' || !ab.bearerModelId) continue
      const unit = s.units[s.models[ab.bearerModelId]?.unitId]
      if (!unit || unit.location !== 'board' || unit.effects.some((e) => e.sourceAbilityId === ab.id)) continue
      effectService.grant(ctx, unit.id, { hiddenBeyond: num(ab.params?.hiddenBeyond, 12) }, { sourceAbilityId: ab.id, sourceUnitId: unit.id, scope: { who: 'self' }, duration: 'battle' })
    }
  },
}

// ---------- FEC-ENH-2 Blood-River Chalice ----------
const chaliceActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!unitId && !!onBoard(state, unitId) && isDamaged(state, unitId),
  resolve(ctx, use) {
    const s = ctx.state
    const me = onBoard(s, use.unitId)
    if (!me) return
    const n = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'heal', '2D3'), { purpose: 'ability', player: use.player, unitId: me.id, commandRerollable: false }).total
    const healed = healUnit(ctx, me.id, n, use.abilityId)
    announce(ctx, use, me.id, `Blood-River Chalice: Heal (${n}), ${healed} damage removed from ${me.name}`)
  },
}
const fecBloodRiverChalice: EngineCodeHook = { name: CODE_CHALICE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: chaliceActivate }

// ---------- FEC-ENH-3 Rousing Oration ----------
function orationUnits(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramOf(state, 'fec.ability.rousing-oration', 'range', 12), 12)
  return unitsOf(state, me.player).filter((id) => id !== me.id && whollyWithinUnit(state, id, me.id, range))
}
const orationActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!unitId && deedsOf(state, unitId) < MAX_DEEDS && orationUnits(state, unitId).length > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const me = onBoard(s, use.unitId)
    if (!me) return
    const units = orationUnits(s, me.id)
    if (units.length === 0) return
    const need = num(paramOf(s, use.abilityId, 'succeedOn', 5), 5)
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: units.length, mode: 'perDie', unitId: me.id, commandRerollable: false })
    const wins = roll.dice.filter((d) => d >= need).length
    const gained = wins > 0 ? addDeeds(ctx, me.id, wins) : 0
    announce(ctx, use, me.id, `Rousing Oration: ${units.length} dice, ${wins} scored ${need}+, ${me.name} gains ${gained} noble deeds point${gained === 1 ? '' : 's'}`)
  },
}
const fecRousingOration: EngineCodeHook = { name: CODE_ORATION, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: orationActivate }

// ---------- FEC-ENH-4 Crimson Victuals ----------
function crimsonTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const mage = onBoard(state, unitId)
  if (!mage) return []
  const range = num(paramOf(state, 'fec.ability.crimson-victuals', 'range', 18), 18)
  const mine = liveModels(state, mage.id)
  return unitsOf(state, other(mage.player))
    .filter((id) => unitGap(state, mage.id, id) <= range + EPS && mine.some((m) => losService.unitVisible(state, m.id, id)))
    .sort((a, b) => woundsLeft(state, a) - woundsLeft(state, b) || (a < b ? -1 : 1))
}
const crimsonActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(crimsonTargets(state, unitId), use),
  targets: crimsonTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const returnRange = num(paramOf(s, use.abilityId, 'returnRange', 6), 6)
    // "your Cryptguard unit within 6 inches of the target" is judged before the damage takes models off the target
    const guard = ofDatasheet(s, use.player, DS_CRYPTGUARD).find((id) => unitGap(s, id, target.id) <= returnRange + EPS) ?? null
    const before = new Map(liveModels(s, target.id).map((m) => [m.id, m.woundsRemaining]))
    const dmg = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'damage', 'D3'), { purpose: 'ability', player: use.player, unitId: target.id, commandRerollable: false }).total
    inflictMortal(ctx, use, target.id, dmg)
    // damage points allocated = health the snapshot lost (a slain model reads 0)
    let allocated = 0
    for (const [id, was] of before) allocated += was - (s.models[id] && s.units[target.id].models.includes(id) ? s.models[id].woundsRemaining : 0)
    const back = guard && allocated > 0 ? returnSlainModels(ctx, guard, allocated, use.abilityId) : 0
    announce(ctx, use, target.id, `Crimson Victuals: ${dmg} mortal damage on ${target.name}, ${allocated} allocated${guard ? `, ${plural(back, 'Cryptguard', 'Cryptguard')} returned` : ''}`)
  },
}
const fecCrimsonVictuals: EngineCodeHook = { name: CODE_CRIMSON, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: crimsonActivate }

// ---------- a rough damage estimate for the AI hints (kept here so the engine does not import src/ai) ----------
const meleeAttacks = (state: GameState, unitId: UnitId): number =>
  liveModels(state, unitId).reduce((n, m) => n + m.weapons.reduce((a, w) => {
    const wp = state.weapons[w]
    return a + (wp && wp.kind === 'melee' && !wp.abilities.some((x) => x.ability === 'COMPANION') ? diceExprMean(wp.A) : 0)
  }, 0), 0)

const nearestEnemyGap = (state: GameState, unitId: UnitId, player: PlayerId): number =>
  Math.min(30, ...unitsOf(state, other(player)).map((e) => unitGap(state, unitId, e)))

// a friendly unit that fights this turn or soon: in combat, or an enemy within a charge's reach
const busy = (state: GameState, unitId: UnitId, player: PlayerId): boolean => inCombat(state, unitId) || nearestEnemyGap(state, unitId, player) <= 12.5

const missingModels = (state: GameState, unitId: UnitId): number => returnableModels(state, unitId)

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus / abilityModeBonus; null = no opinion) ----------
// below -2 the bot passes instead of using the ability. Ability-use options carry no unit hint, so general-bound abilities fall back to
// the army's general.
export function fecAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  const general = unitId ?? generalOf(state, player)
  switch (code) {
    case CODE_SUMMON: {
      // spend when a Knight can come back (4 Health for 2 points), or when the Hero cannot reach 6 for Feeding Frenzy anyway and
      // Cryptguard are missing; otherwise keep the points for Feeding Frenzy
      for (const h of summonTargets(state, null, player)) {
        const d = deedsOf(state, h)
        const splits = summonSplits(state, h)
        if (splits.some((sp) => sp.k > 0)) return 0
        const missing = ofDatasheet(state, player, DS_CRYPTGUARD).reduce((n, id) => n + missingModels(state, id), 0)
        if (d <= 3 && missing >= 1) return 0
        if (d < MAX_DEEDS && !busy(state, h, player) && missing >= 3) return 0
      }
      return -3
    }
    case CODE_DERANGED: {
      if (!general) return -3
      const fine = derangedTargets(state, general).some((id) => derangedWorth(state, player, id) >= 2)
      // the one cast of the phase is better spent on Crimson Victuals when that brings Cryptguard back
      if (!fine) return -3
      return crimsonWorth(state, player, general) >= 1.5 ? -0.5 : 0.6
    }
    case CODE_CRIMSON: {
      if (!general) return -3
      const worth = crimsonWorth(state, player, general)
      return worth > 0 ? 0.2 + Math.min(1, worth * 0.4) : -3
    }
    case CODE_ORATION:
      return general && deedsOf(state, general) < MAX_DEEDS && orationUnits(state, general).length >= 1 ? 0 : -3
    case CODE_CHALICE: {
      if (!general || !onBoard(state, general)) return -3
      const damage = liveModels(state, general).reduce((a, m) => a + Math.max(0, modelStats(state, m).W - m.woundsRemaining), 0)
      return damage >= 4 ? 0 : -3
    }
    default:
      return null
  }
}

// how much a Deranged Transformation on `unitId` is worth: a unit that is about to charge, or one whose Move falls up to 2" short of
// an objective it does not hold
function derangedWorth(state: GameState, player: PlayerId, unitId: UnitId): number {
  if (inCombat(state, unitId)) return 0
  const gap = nearestEnemyGap(state, unitId, player)
  const move = moveOf(state, unitId)
  const swing = Math.min(4, meleeAttacks(state, unitId) * 0.2)
  if (gap <= move + 2 + 6 && gap > 3) return 2 + swing
  const radius = num(state.mission.data.objectiveMarkerRadius, 3)
  const models = liveModels(state, unitId)
  for (const o of liveObjectives(state)) {
    if (o.controller === player) continue
    const d = Math.min(...models.map((m) => Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z) - radius))
    if (d > move && d <= move + 2) return 2
  }
  return 0.5 + swing * 0.2
}

// Crimson Victuals: a kill, or Cryptguard coming back from a target they stand near
function crimsonWorth(state: GameState, player: PlayerId, general: UnitId): number {
  const guards = ofDatasheet(state, player, DS_CRYPTGUARD)
  let best = 0
  for (const t of crimsonTargets(state, general)) {
    const left = woundsLeft(state, t)
    let v = left <= 2 ? 1.5 : 0.3
    const near = guards.some((g) => unitGap(state, g, t) <= 6 + EPS)
    if (near) v += Math.min(2, guards.reduce((n, g) => n + missingModels(state, g), 0) * 0.5)
    best = Math.max(best, v)
  }
  return best
}

export function fecTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_SUMMON:
      // the Hero that can bring back the most: Knights first, then whoever holds the most points
      return deedsOf(state, unitId) * 0.3 + (summonSplits(state, unitId).some((sp) => sp.k > 0) ? 2 : 0)
    case CODE_DERANGED:
      return derangedWorth(state, player, unitId) + (hasKeyword(state, unitId, 'CAVALRY') || hasKeyword(state, unitId, 'HERO') ? 0.5 : 0)
    case CODE_CRIMSON: {
      const left = woundsLeft(state, unitId)
      const guards = ofDatasheet(state, player, DS_CRYPTGUARD)
      return (left <= 2 ? 3 : 0) + Math.max(0, 8 - left) * 0.2 + (guards.some((g) => unitGap(state, g, unitId) <= 6 + EPS) ? 2 : 0)
    }
    default:
      return null
  }
}

// which split of the points to spend: the most Health back for the points, and a penalty for dropping a 6-point Hero below Feeding Frenzy
export function fecModeBonus(state: GameState, code: string, _unitId: UnitId | null, optionId: string, target: UnitId | null): number | null {
  if (code !== CODE_SUMMON) return null
  const want = parseMode(optionId)
  if (!want || !target || !state.units[target]) return 0
  const points = want.k * costOf(state, 'knightsCost') + want.c * costOf(state, 'cryptguardCost')
  const health = want.k * 4 + want.c
  const frenzy = deedsOf(state, target) >= MAX_DEEDS && points > 0 && unitsOf(state, state.units[target].player).some((id) => id !== target && inCombat(state, id)) ? 1.5 : 0
  return Math.max(0, health * 0.3 - points * 0.15 - frenzy)
}

export const fecHooks: Record<string, EngineCodeHook> = {
  fecNobleDeeds, fecSummonLoyalSubjects, fecFeedingFrenzy, fecDerangedTransformation, fecVictoryFeast, fecUlguanCloak, fecBloodRiverChalice,
  fecRousingOration, fecCrimsonVictuals,
}
