// Attack sequence, AoS 4 / Spearhead (10-rules-core CORE-11..13, 13-engine-port-plan §1.1 `attack.ts`). Shared by the
// shooting phase and the combat phase. Nothing in here asks the players anything: targets are declared by the phase
// module (CORE-11.1-11.4), then `advance` resolves the whole ability in one go.
//
//   per target unit (declare order) -> per weapon profile (merged "fast dice" batches of models with an identical profile)
//     -> hit dice -> wound dice -> save dice -> damage per successful attack -> damage POOL of the target unit
//   after the last attack of the ability (CORE-13.1, active player's units first):
//     -> one ward die per point (CORE-13.2) -> allocation (CORE-13.4): the damaged model first, otherwise the model
//        farthest from the attacker; a model is slain at 0 wounds; spill-over carries to the next model
//     -> models removed to restore coherency are slain too (CORE-13.5); the last model slain destroys the unit and the
//        rest of the pool is discarded (CORE-13.6).
//
// The "damage counter" of CORE-13.4 is the single damaged model's `woundsRemaining` (a unit is *damaged* while some
// model has fewer wounds than its Health), so Heal effects only have to raise `woundsRemaining`.
// RNG consumption order (CORE-11.9): per target, per profile: hits -> wounds -> saves -> damage dice; then wards.
import type { DiceExpr, WeaponAbility, WeaponAbilityName } from '../data/types'
import { clampHitWoundModifier, clampStat, netSaveModifier, parseDiceExpr } from './dice'
import type { AttackRollContext } from './events'
import { coherencyGroups, distance, ENGAGEMENT_H, EPS, horizontalGap, isCoherent } from './geometry'
import type { AttackContext, RollModifierResult } from './hooks'
import { codeHookFor, hookService, sourcesFor } from './hooks-impl'
import { cardChargeDamage, cardHitRule, cardIgnoresRend, cardSaveModifier, cardWard, cardWoundModifier } from './cardFlags'
import { losService } from './los'
import type { AdvanceResult, DecisionHandler, EngineContext } from './modules'
import { datasheetOf, keywordsOf, modelStats, recordModelAttacked, removeModel, unitModels } from './state'
import { weaponService } from './weapons'
import {
  EngineInvariantError,
  type AttackGroup, type AttackKind, type DeclaredTarget, type DiceRoll, type GameState, type Model, type ModelId, type PlayerId,
  type RollModifier, type RuntimeAbility, type RuntimeWeapon, type Unit, type UnitId, type Vec3, type WeaponId,
} from './types'

// overwatchHitOn is kept for the 42k call sites; AoS has no Fire Overwatch
export interface AttackBegin { kind: AttackKind; attackerUnitId: UnitId; overwatch: boolean; targets: DeclaredTarget[]; overwatchHitOn?: number }

export interface DestroyedBy { player: PlayerId | null; unitId: UnitId | null; modelId: ModelId | null; kind: AttackKind | 'mortal' | 'other'; psychic?: boolean }

export interface AttackService {
  begin(ctx: EngineContext, spec: AttackBegin): void
  // resolves the whole sequence (attacks, queued mortal damage, damage pools); always returns 'done' — nothing in the
  // AoS attack sequence asks a player anything
  advance(ctx: EngineContext): AdvanceResult
  readonly handler: DecisionHandler
  // mortal damage into a damage pool (no hit/wound/save, ward still applies, CORE-13.3). Queued into the running sequence
  // when there is one, otherwise resolved on the spot. `by`: who it counts as destroyed by.
  queueMortalWounds(ctx: EngineContext, targetUnitId: UnitId, count: number, source: string, lostOnDeath: boolean, by?: { player: PlayerId; unitId: UnitId; modelId: ModelId; psychic?: boolean }): void
  destroyModel(ctx: EngineContext, modelId: ModelId, by: DestroyedBy): void
  finishDestroy(ctx: EngineContext, modelId: ModelId, by: DestroyedBy): void
  removeDeclaredTargets(ctx: EngineContext, pred: (t: DeclaredTarget) => boolean): DeclaredTarget[]
  dropAttackerModels(ctx: EngineContext, modelIds: ModelId[]): void
  appendDeclaredTargets(ctx: EngineContext, targets: DeclaredTarget[]): void
}

// ---------- shot-this-turn bookkeeping (42k code hooks read it) ----------
export function shotThisTurn(state: GameState, unitId: UnitId): boolean {
  const u = state.units[unitId]
  if (!u) return false
  const rec = u.player && state.players[u.player].secondaryState['shotTurn'] as { key: string; unitIds: UnitId[] } | undefined
  return !!rec && rec.key === `${state.round}:${state.activePlayer}` && rec.unitIds.includes(unitId)
}
function recordShot(state: GameState, unitId: UnitId): void {
  const u = state.units[unitId]
  if (!u) return
  const key = `${state.round}:${state.activePlayer}`
  const ss = state.players[u.player].secondaryState
  const rec = ss['shotTurn'] as { key: string; unitIds: UnitId[] } | undefined
  if (!rec || rec.key !== key) ss['shotTurn'] = { key, unitIds: [unitId] }
  else if (!rec.unitIds.includes(unitId)) rec.unitIds = [...rec.unitIds, unitId]
}

// ---------- combat range, cover, obscuring, Guarded Hero (shared with shooting.ts / fight.ts) ----------
// The visibility half of "in combat" (CORE-1.5) and the terrain queries belong to los.ts (WP4); they are read through
// optional members so this file works with or without them.
interface LosExtras {
  inCombat?(state: GameState, unitA: UnitId, unitB: UnitId): boolean
  coverPenalty?(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId): unknown
  obscured?(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId): unknown
}
const losX = (): LosExtras => losService as unknown as LosExtras

export function modelsInCombatRange(a: Pick<Model, 'pos' | 'facing' | 'base'>, b: Pick<Model, 'pos' | 'facing' | 'base'>): boolean {
  return horizontalGap(a, b) <= ENGAGEMENT_H + EPS
}

function boardModels(state: GameState, unitId: UnitId): Model[] {
  const u = state.units[unitId]
  return u && u.location === 'board' ? unitModels(state, unitId) : []
}

// CORE-1.5: two units are in combat while within each other's combat range and visible to each other
export function unitsInCombat(state: GameState, aId: UnitId, bId: UnitId): boolean {
  const f = losX().inCombat
  if (typeof f === 'function') return !!f.call(losService, state, aId, bId)
  const A = boardModels(state, aId), B = boardModels(state, bId)
  return A.some((a) => B.some((b) => modelsInCombatRange(a, b)))
}

export function enemyUnitsInCombat(state: GameState, unitId: UnitId): UnitId[] {
  const me = state.units[unitId]
  if (!me || me.location !== 'board') return []
  return Object.values(state.units).filter((u) => u.player !== me.player && u.location === 'board' && unitsInCombat(state, unitId, u.id)).map((u) => u.id)
}
export function isInCombat(state: GameState, unitId: UnitId): boolean { return enemyUnitsInCombat(state, unitId).length > 0 }

// unit-to-unit distance (closest bases)
export function unitDistance(state: GameState, aId: UnitId, bId: UnitId): number {
  let best = Infinity
  for (const a of boardModels(state, aId)) for (const b of boardModels(state, bId)) best = Math.min(best, distance(a, b))
  return best
}

const kw = (state: GameState, unitId: UnitId): string[] => hookService.keywordsFor?.(state, unitId) ?? keywordsOf(state, unitId)

// CORE-14.2: a HERO (not MONSTER, not WAR MACHINE) within the combat range of a friendly non-HERO unit
export function guardedHero(state: GameState, targetUnitId: UnitId): boolean {
  const t = state.units[targetUnitId]
  if (!t || t.location !== 'board') return false
  const k = kw(state, targetUnitId)
  if (!k.includes('HERO') || k.includes('MONSTER') || k.includes('WAR MACHINE')) return false
  const mine = boardModels(state, targetUnitId)
  return Object.values(state.units).some((u) => u.player === t.player && u.id !== t.id && u.location === 'board' && !kw(state, u.id).includes('HERO')
    && boardModels(state, u.id).some((m) => mine.some((tm) => modelsInCombatRange(m, tm))))
}

const truthyPenalty = (v: unknown): boolean => (typeof v === 'number' ? v !== 0 : !!v)

// CORE-16.5: -1 to hit against a target behind / wholly on a Cover feature, unless it charged this turn or has FLY
export function coverFor(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId): boolean {
  const t = state.units[targetUnitId]
  if (!t || t.turn.chargedThisTurn || kw(state, targetUnitId).includes('FLY')) return false
  const f = losX().coverPenalty
  return typeof f === 'function' ? truthyPenalty(f.call(losService, state, attackerUnitId, targetUnitId)) : false
}

// CORE-16.6 / SPH-5.5: a target behind / wholly on an Obscuring feature cannot be shot unless it has FLY
export function obscuredFrom(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId): boolean {
  if (kw(state, targetUnitId).includes('FLY')) return false
  const f = losX().obscured
  return typeof f === 'function' ? truthyPenalty(f.call(losService, state, attackerUnitId, targetUnitId)) : false
}

// ---------- weapon helpers ----------
const hasAb = (w: RuntimeWeapon, a: WeaponAbilityName): boolean => w.abilities.some((x) => x.ability === a)

// CORE-12.2: +1 Rend per Anti-X that applies (cumulative); keyword '@charged' = the target charged this turn
function antiBonus(state: GameState, w: RuntimeWeapon, targetUnitId: UnitId): number {
  let n = 0
  const tk = kw(state, targetUnitId)
  for (const a of w.abilities) {
    if (a.ability !== 'ANTI') continue
    if (a.keyword === '@charged') { if (state.units[targetUnitId]?.turn.chargedThisTurn) n++ } else if (a.keyword && tk.includes(a.keyword)) n++
  }
  return n
}

// ---------- AttackContext ----------
function buildActx(ctx: EngineContext, kind: AttackKind, attackerUnitId: UnitId, attackerModelId: ModelId, weapon: RuntimeWeapon, targetUnitId: UnitId, targetModelId: ModelId | null, inCover: boolean): AttackContext {
  const s = ctx.state
  const am = s.models[attackerModelId]
  let range = Infinity
  if (am) for (const tm of boardModels(s, targetUnitId)) range = Math.min(range, distance(am, tm))
  return {
    kind, overwatch: false, attackerUnitId, attackerModelId, weapon, targetUnitId, targetModelId, range,
    halfRange: kind === 'ranged' && Number.isFinite(range) && range <= weapon.range / 2 + EPS, inCover,
    charged: s.units[attackerUnitId]?.turn.chargedThisTurn ?? false,
    oathTarget: false, attackerInEngagement: isInCombat(s, attackerUnitId),
  }
}

// shapeless context for mortal damage that comes from no weapon (ward queries only read the target side)
function nullActx(state: GameState, targetUnitId: UnitId, attackerUnitId: UnitId | null): AttackContext {
  const w: RuntimeWeapon = { id: '', name: '', kind: 'ranged', range: 0, A: 0, skill: null, S: 0, AP: 0, wound: 4, rend: 0, D: 0, abilities: [], profileGroup: null }
  return {
    kind: 'ranged', overwatch: false, attackerUnitId: attackerUnitId ?? targetUnitId, attackerModelId: '', weapon: w, targetUnitId,
    targetModelId: boardModels(state, targetUnitId)[0]?.id ?? null, range: Infinity, halfRange: false, inCover: false, charged: false,
    oathTarget: false, attackerInEngagement: false,
  }
}

const rollCtx = (a: AttackContext): AttackRollContext => ({ attackerUnitId: a.attackerUnitId, attackerModelId: a.attackerModelId, weaponId: a.weapon.id, targetUnitId: a.targetUnitId })

// ---------- attack count (CORE-2.8: random Attacks rolled once per model per declare) ----------
export function rollAttackCount(ctx: EngineContext, modelId: ModelId, weaponId: WeaponId, targetUnitId: UnitId | null): number {
  const s = ctx.state
  const model = s.models[modelId]
  if (!model) return 0
  const unit = s.units[model.unitId]
  const base = s.weapons[weaponId]
  const companion = hasAb(base, 'COMPANION')
  // GLO-AB-1: effectiveWeapon applies only `affectsCompanion` modifiers to a Companion weapon
  const weapon = weaponService.effectiveWeapon(s, modelId, weaponId)
  const { total } = ctx.rollExpr(weapon.A, { purpose: 'attacks', player: unit.player, unitId: unit.id, modelId, weaponId })
  let n = total
  if (!companion && targetUnitId) {
    const actx = buildActx(ctx, weapon.kind, unit.id, modelId, weapon, targetUnitId, null, false)
    for (const r of ctx.services.hooks.collect(ctx, 'onAttackCount', { attack: actx, attacks: total })) {
      if (r.result.kind === 'attacks') n += r.result.delta ?? 0
    }
  }
  return Math.max(0, n)
}

// ---------- one stage of fast dice (hit / wound / save) ----------
interface DieOut { u: number; final: number; success: boolean; critical: boolean }
interface StageParams {
  hook: 'onHitRoll' | 'onWoundRoll' | 'onSaveRoll'
  purpose: 'hit' | 'wound' | 'save'
  count: number
  actx: AttackContext
  attackerPlayer: PlayerId
  // the roll's owner (attacker for hit/wound, defender for save)
  roller: PlayerId
  needed: number
  statics: RollModifier[]
  rend: number
  companion: boolean
  // Wreathed in Smoke / Go to Ground (cards): only an unmodified 6 succeeds
  onlySix?: boolean
  unitId: UnitId
  targetUnitId: UnitId
  weaponId: WeaponId
  modelId: ModelId
}
interface StageResult { roll: DiceRoll; outs: DieOut[] }

function runStage(ctx: EngineContext, p: StageParams): StageResult {
  const s = ctx.state
  const isSave = p.purpose === 'save'
  type Ent = { mods: number[]; ignore: boolean; ignoreNeg: boolean; autoPass: boolean; autoFail: boolean; onlySix: boolean; crit: number; rr: { kind: string; id: string }[] }
  const cache = new Map<number, Ent>()
  const entFor = (u: number, idx: number, roll: DiceRoll): Ent => {
    const hit = cache.get(u)
    if (hit) return hit
    const ent: Ent = { mods: [], ignore: false, ignoreNeg: false, autoPass: false, autoFail: false, onlySix: false, crit: 7, rr: [] }
    const got = hookService.collect(ctx, p.hook, { attack: p.actx, roll: { purpose: p.purpose, roll, dieIndex: idx, unmodified: u, rerolled: false } })
    for (const g of got) {
      if (g.result.kind !== 'roll') continue
      const r = g.result as RollModifierResult
      // CORE-12.4 Companion: friendly buffs do not apply, negative modifiers and enemy abilities still do
      const friendly = !!g.source.unitId && s.units[g.source.unitId]?.player === p.attackerPlayer
      // F18 (HOS C1): unless the modifier's effect names Companion weapons (RollModifierResult.affectsCompanion)
      if (p.companion && !isSave && friendly && (r.modifier ?? 0) > 0 && !r.affectsCompanion) continue
      if (r.modifier) ent.mods.push(r.modifier)
      if (r.ignoreModifiers) ent.ignore = true
      if (r.ignoreNegative) ent.ignoreNeg = true
      if (r.autoPass) ent.autoPass = true
      if (r.autoFail) ent.autoFail = true
      // F16 (Effect.onlySixes, IDK-ENH Mind Flare): only an unmodified 6 succeeds, whatever the modifiers or auto-pass
      if (r.onlySix && !isSave) ent.onlySix = true
      if (r.critThreshold !== undefined) ent.crit = Math.min(ent.crit, r.critThreshold)
      if (r.reroll) ent.rr.push({ kind: r.reroll, id: g.source.id })
    }
    cache.set(u, ent)
    return ent
  }
  const evalDie = (u: number, idx: number, roll: DiceRoll): DieOut & { rr: Ent['rr'] } => {
    const ent = entFor(u, idx, roll)
    let final: number
    // F12 (SBG-ENH Aura of Night, Effect.ignoreNegativeModifiers): negative modifiers (card ones included) are dropped.
    // F14 RULING (core 17.0 step 3 + the glossary: the weapon's Rend is subtracted from the save roll): Rend is a
    // negative modifier to the save roll, so an ignore-negative save drops Rend too, and an ignore-all save (NH-BT-1 Ethereal,
    // Effect.ignoreModifiers 'save') is the bare die against the Save characteristic. Unmodified 1s still fail.
    const raw = [...p.statics.map((m) => m.value), ...ent.mods]
    const mods = ent.ignoreNeg ? raw.filter((m) => m > 0) : raw
    if (isSave) {
      const rend = ent.ignore || ent.ignoreNeg ? 0 : p.rend
      final = u - rend + (ent.ignore ? 0 : netSaveModifier(mods))
    } else {
      const sum = mods.reduce((a, b) => a + b, 0)
      final = u + (ent.ignore ? 0 : clampHitWoundModifier(sum))
    }
    const success = !ent.autoFail && u !== 1 && (p.onlySix || ent.onlySix ? u === 6 : (ent.autoPass || final >= p.needed))
    return { u, final, success, critical: !isSave && p.purpose === 'hit' && success && (u === 6 || u >= ent.crit), rr: ent.rr }
  }
  const spec = {
    purpose: p.purpose, player: p.roller, sides: 6 as const, count: p.count, mode: 'perDie' as const,
    modifiers: isSave ? [...(p.rend ? [{ source: 'rend', value: -p.rend }] : []), ...p.statics] : p.statics,
    modifierCap: isSave ? null : 1, unitId: p.unitId, modelId: p.modelId, weaponId: p.weaponId, targetUnitId: p.targetUnitId, needed: p.needed, commandRerollable: false,
  }
  let roll = ctx.roll(spec)
  let evals = roll.dice.map((u, i) => evalDie(u, i, roll))
  // re-rolls offered by abilities (ones / fails / all / one die), applied once per die, source by source
  const bySource = new Map<string, number[]>()
  evals.forEach((e, i) => {
    for (const r of e.rr) {
      if (!(r.kind === 'ones' ? e.u === 1 : !e.success)) continue // 'fails' | 'all' | 'oneDie' act on failed dice
      const list = bySource.get(r.id) ?? []
      if (r.kind === 'oneDie') { if (list.length === 0) list.push(i) } else if (!list.includes(i)) list.push(i)
      bySource.set(r.id, list)
    }
  })
  const done = new Set<number>()
  for (const [id, idxs] of bySource) {
    const fresh = idxs.filter((i) => !done.has(i))
    if (fresh.length === 0) continue
    roll = ctx.reroll(roll, fresh, id)
    fresh.forEach((i) => done.add(i))
  }
  if (done.size > 0) { const r = roll; evals = r.dice.map((u, i) => evalDie(u, i, r)) }
  return { roll, outs: evals.map(({ rr: _rr, ...o }) => o) }
}

// ---------- the damage of one successful attack ----------
function damageOf(ctx: EngineContext, w: RuntimeWeapon, actx: AttackContext, ownerPlayer: PlayerId, mods: { delta: number; halve: boolean; reduction: number; set: number | null }): number {
  const { total } = ctx.rollExpr(w.D, { purpose: 'damage', player: ownerPlayer, unitId: actx.attackerUnitId, modelId: actx.attackerModelId, weaponId: w.id, targetUnitId: actx.targetUnitId })
  // Mount the Attack's spearhead: its melee weapons have Charge (+1 Damage) this round (no stacking with the weapon's own)
  const chargeBonus = hasAb(w, 'CHARGE_DAMAGE') || (w.kind === 'melee' && cardChargeDamage(ctx.state, actx.attackerUnitId))
  return applyDamageMods(total + (chargeBonus && actx.charged ? 1 : 0), mods)
}
function applyDamageMods(d: number, m: { delta: number; halve: boolean; reduction: number; set: number | null }): number {
  let v = m.set ?? d
  v += m.delta
  if (m.halve) v = Math.ceil(v / 2)
  v -= m.reduction
  return Math.max(1, v)
}

// F12 (SKV-AB-3 Shock Gauntlets): hits one critical hit scores for CRIT_2_HITS; no value = 2
function critHitCount(ctx: EngineContext, value: WeaponAbility['value'], player: PlayerId, unitId: UnitId, modelId: ModelId, weaponId: WeaponId): number {
  if (value === undefined || value === null) return 2
  return Math.max(1, ctx.rollExpr(value, { purpose: 'ability', player, unitId, modelId, weaponId }).total)
}
// F12 (SKV-AB-5 Warp Lightning Blast): mortal damage one HIT_MORTAL hit inflicts; no value = 1 (dice values roll per hit)
function mortalPerHit(ctx: EngineContext, value: WeaponAbility['value'], player: PlayerId, unitId: UnitId, modelId: ModelId, weaponId: WeaponId): number {
  if (value === undefined || value === null) return 1
  return Math.max(0, ctx.rollExpr(value, { purpose: 'ability', player, unitId, modelId, weaponId }).total)
}

// ---------- F14: several critical-hit abilities on one weapon (core 20.0) ----------
// When more than one of a weapon's abilities would apply on a critical hit, the attacking model's player picks one of them before
// the attack sequence starts. advance() raises one chooseOption (topic 'critChoice') per
// (weapon, target unit) of the declared attacks whose effective weapon has two or more distinct crit abilities; the pick is a
// phase mark read by resolveBatch. Each option carries hint.value = its expected damage per critical hit (the AI's pick).
export const CRIT_ABILITIES: readonly WeaponAbilityName[] = ['CRIT_MORTAL', 'CRIT_2_HITS', 'CRIT_AUTO_WOUND']
const CRIT_PICK = 'critPick:'
const critKey = (attackerUnitId: UnitId, weaponId: WeaponId, targetUnitId: UnitId): string => `${CRIT_PICK}${attackerUnitId}|${weaponId}|${targetUnitId}=`

// the distinct crit abilities a weapon has, first listed first; none when HIT_MORTAL replaces the whole hit roll
export function critAbilitiesOf(w: RuntimeWeapon): WeaponAbility[] {
  if (w.abilities.some((a) => a.ability === 'HIT_MORTAL')) return []
  const out: WeaponAbility[] = []
  for (const a of w.abilities) if (CRIT_ABILITIES.includes(a.ability) && !out.some((o) => o.ability === a.ability)) out.push(a)
  return out
}

const avgExpr = (e: DiceExpr | undefined | null, dflt: number): number => {
  if (e === undefined || e === null) return dflt
  if (typeof e === 'number') return e
  try {
    const p = parseDiceExpr(e)
    return p.sides === null ? p.flat : p.count * (p.sides + 1) / 2 + p.flat
  } catch { return dflt }
}
const pRoll = (needed: number): number => Math.min(5 / 6, Math.max(0, (7 - needed) / 6)) // unmodified 1 always fails

// expected damage one critical hit of `w` deals against `rep` with each crit ability (CORE-12.1 forms; modifiers ignored)
export function critExpectedDamage(state: GameState, w: RuntimeWeapon, rep: Model, rend: number, a: WeaponAbility): number {
  const st = modelStats(state, rep)
  const dmg = avgExpr(w.D, 1)
  const pWound = pRoll(w.wound)
  const pUnsaved = st.noSave ? 1 : 1 - pRoll(st.Sv + rend)
  if (a.ability === 'CRIT_MORTAL') return dmg
  if (a.ability === 'CRIT_AUTO_WOUND') return pUnsaved * dmg
  return avgExpr(a.value, 2) * pWound * pUnsaved * dmg
}

// the crit ability resolveBatch uses: the recorded pick, else the best expected damage (ties: first listed), else the only one
function chosenCrit(state: GameState, attackerUnitId: UnitId, weaponId: WeaponId, targetUnitId: UnitId, w: RuntimeWeapon, rep: Model, rend: number): WeaponAbility | undefined {
  const list = critAbilitiesOf(w)
  if (list.length <= 1) return list[0]
  const mark = state.phaseState.marks.find((m) => m.startsWith(critKey(attackerUnitId, weaponId, targetUnitId)))
  const picked = mark ? list.find((a) => a.ability === mark.slice(mark.indexOf('=') + 1)) : undefined
  if (picked) return picked
  let best = list[0]
  let bestV = critExpectedDamage(state, w, rep, rend, best)
  for (const a of list.slice(1)) { const v = critExpectedDamage(state, w, rep, rend, a); if (v > bestV + 1e-9) { best = a; bestV = v } }
  return best
}

const CRIT_LABEL: Record<string, string> = { CRIT_MORTAL: 'Crit (Mortal)', CRIT_2_HITS: 'Crit (2 Hits)', CRIT_AUTO_WOUND: 'Crit (Auto-wound)' }

// raises the attacker's pick for the first (weapon, target) still undecided; true = a decision is now pending
function askCritChoice(ctx: EngineContext, kind: AttackKind, attackerUnitId: UnitId, targets: DeclaredTarget[]): boolean {
  const s = ctx.state
  const seen = new Set<string>()
  for (const t of targets) {
    const key = critKey(attackerUnitId, t.weaponId, t.targetUnitId)
    if (seen.has(key)) continue
    seen.add(key)
    if (s.phaseState.marks.some((m) => m.startsWith(key))) continue
    const rep = unitModels(s, t.targetUnitId)[0]
    if (!rep || !s.models[t.modelId]) continue
    const draft = weaponService.effectiveWeapon(s, t.modelId, t.weaponId)
    const actx0 = buildActx(ctx, kind, attackerUnitId, t.modelId, draft, t.targetUnitId, rep.id, coverFor(s, attackerUnitId, t.targetUnitId))
    const ew = weaponService.effectiveWeapon(s, t.modelId, t.weaponId, actx0)
    const list = critAbilitiesOf(ew)
    if (list.length <= 1) continue
    const rend = cardIgnoresRend(s, t.targetUnitId) ? 0 : Math.max(0, ew.rend + antiBonus(s, ew, t.targetUnitId))
    const player = s.units[attackerUnitId].player
    ctx.decide({
      kind: 'chooseOption', player, window: kind === 'melee' ? 'fight.targetsDeclared' : 'shooting.targetsDeclared', canPass: false,
      context: { topic: 'critChoice', unitId: attackerUnitId, abilityId: null, data: { key, weaponId: t.weaponId, targetUnitId: t.targetUnitId, weaponName: ew.name } },
      options: list.map((a) => ({
        id: a.ability, label: `${ew.name}: ${CRIT_LABEL[a.ability] ?? a.ability}${a.ability === 'CRIT_2_HITS' && a.value !== undefined && a.value !== 2 ? ` (${a.value} hits)` : ''}`,
        action: { type: 'chooseOption', player, decisionId: '', optionId: a.ability },
        hint: { value: Math.round(critExpectedDamage(s, ew, rep, rend, a) * 1000) / 1000, unitId: t.targetUnitId },
      })),
    })
    return true
  }
  return false
}

// ---------- F14 (BOK C1): turn ledger, who took damage / who slew with combat attacks this turn ----------
// mission.custom.turnLedger (types.ts is a frozen contract), treated as empty whenever its key is not the current turn
// F16 (IDK C1): lostModels = units that had a model slain this turn (any damage source; not redeploys or reinforcements)
interface TurnLedger { key: string; damaged: UnitId[]; slewInFight: UnitId[]; lostModels?: UnitId[] }
const turnKey = (s: GameState): string => `${s.round}:${s.activePlayer}`
function ledgerOf(s: GameState): TurnLedger {
  const l = s.mission.custom.turnLedger as TurnLedger | undefined
  return l && l.key === turnKey(s) ? l : { key: turnKey(s), damaged: [], slewInFight: [], lostModels: [] }
}
function noteLedger(s: GameState, field: 'damaged' | 'slewInFight' | 'lostModels', unitId: UnitId): void {
  const l = ledgerOf(s)
  const list = l[field] ?? []
  if (list.includes(unitId)) return
  s.mission.custom = { ...s.mission.custom, turnLedger: { ...l, [field]: [...list, unitId] } }
}
// true when at least one damage point (normal or mortal, any source, after wards / redirects / ignored points) was allocated
// to the unit this turn; a unit wiped out counts
export function damagedThisTurn(state: GameState, unitId: UnitId): boolean { return ledgerOf(state).damaged.includes(unitId) }
// true when the unit's combat attacks (Crit (Mortal) pools of combat attacks included) slew an enemy model this turn
export function slewInFightThisTurn(state: GameState, unitId: UnitId): boolean { return ledgerOf(state).slewInFight.includes(unitId) }
// F16 (IDK C1, IDK-AB-3 Bloodthirsty Predators): true when a model of the unit was slain this turn (attacks, mortal damage from
// abilities, retreat damage, miscasts; a unit wiped out counts). Models removed by redeploys or Call for Reinforcements do not.
export function lostModelThisTurn(state: GameState, unitId: UnitId): boolean { return (ledgerOf(state).lostModels ?? []).includes(unitId) }

// ---------- F14 (NH C4 fallback): the first unit that declared attacks on each target this phase ----------
const FIRST_ATK = 'atk:tg:'
// the unit whose Shoot / Fight declaration first named `targetUnitId` this phase (attackService.begin), or null
export function firstAttackerThisPhase(state: GameState, targetUnitId: UnitId): UnitId | null {
  const key = `${FIRST_ATK}${targetUnitId}=`
  const m = state.phaseState.marks.find((x) => x.startsWith(key))
  return m ? m.slice(key.length) : null
}

// F12 (SER C4): unmodified save 1s of the running attack sequence, per target unit (null outside attackService.advance)
let saveOnesTally: Record<UnitId, number> | null = null
// F16 (TZE C3): unmodified 1s on the attacking unit's hit dice in the running attack sequence (null outside attackService.advance)
let hitOnesTally: { n: number } | null = null

// ---------- pools ----------
interface Pool { unitId: UnitId; points: number; by: DestroyedBy; source: AttackRollContext | { abilityId: string }; mortal: boolean; attackerUnitId: UnitId | null }
// one pool per target unit and damage kind: mortal damage (crit-mortal hits, abilities) never shares a pool with normal damage,
// so wards that care about the kind, DamageApplied.mortal and the slain-by kind all see the right one (F10)
type Pools = Map<string, Pool>

function addToPool(pools: Pools, unitId: UnitId, points: number, by: DestroyedBy, source: Pool['source'], mortal: boolean, attackerUnitId: UnitId | null): void {
  if (points <= 0) return
  const key = `${unitId}|${mortal ? 'mortal' : 'normal'}`
  const p = pools.get(key)
  if (p) p.points += points
  else pools.set(key, { unitId, points, by, source, mortal, attackerUnitId })
}

// ---------- resolving the declared attacks ----------
interface Entry { modelId: ModelId; n: number }
interface Batch { targetUnitId: UnitId; weaponId: WeaponId; entries: Entry[] }

function resolveBatch(ctx: EngineContext, kind: AttackKind, attackerUnitId: UnitId, batch: Batch, pools: Pools): void {
  const s = ctx.state
  const attacker = s.units[attackerUnitId]
  const target = s.units[batch.targetUnitId]
  if (!attacker || !target || target.location !== 'board') return
  const tModels = unitModels(s, batch.targetUnitId)
  if (tModels.length === 0) return
  const rep = tModels[0]
  const total = batch.entries.reduce((a, e) => a + e.n, 0)
  if (total <= 0) return
  const lead = batch.entries[0].modelId
  const base = s.weapons[batch.weaponId]
  const companion = hasAb(base, 'COMPANION')
  const draft = weaponService.effectiveWeapon(s, lead, batch.weaponId)
  const cover = coverFor(s, attackerUnitId, batch.targetUnitId)
  const actx0 = buildActx(ctx, kind, attackerUnitId, lead, draft, batch.targetUnitId, rep.id, cover)
  const ew = weaponService.effectiveWeapon(s, lead, batch.weaponId, actx0)
  const actx: AttackContext = { ...actx0, weapon: ew }
  const attackerPlayer = attacker.player
  const targetPlayer = target.player
  const rctx = rollCtx(actx)
  const by: DestroyedBy = { player: attackerPlayer, unitId: attackerUnitId, modelId: lead, kind }
  const rend = cardIgnoresRend(s, batch.targetUnitId) ? 0 : Math.max(0, ew.rend + antiBonus(s, ew, batch.targetUnitId))

  // 1. hit
  const hitMods: RollModifier[] = []
  if (cover) hitMods.push({ source: 'cover', value: -1 })
  if (kind === 'ranged' && guardedHero(s, batch.targetUnitId)) hitMods.push({ source: 'guardedHero', value: -1 })
  const cardHit = cardHitRule(s, attackerUnitId, batch.targetUnitId, kind)
  if (cardHit.modifier) hitMods.push({ source: 'card', value: cardHit.modifier })
  // criticals: one crit ability per weapon. F14 (core 20.0): with more than one, the attacking player picked one before the
  // sequence (critChoice decision, see advance); no pick on record = the one with the best expected damage. F12: HIT_MORTAL
  // (SKV-AB-5) turns every hit into mortal damage and makes no wound roll, so no crit ability applies to it; CRIT_2_HITS may carry
  // a value = hits per critical hit
  const critEntry = chosenCrit(s, attackerUnitId, batch.weaponId, batch.targetUnitId, ew, rep, rend)
  const hitMortal = ew.abilities.find((a) => a.ability === 'HIT_MORTAL')
  const critAb = hitMortal ? undefined : critEntry?.ability
  let hitOuts: DieOut[]
  let copiesOf: number[] = []
  if (ew.skill === null) {
    hitOuts = Array.from({ length: total }, () => ({ u: 0, final: 0, success: true, critical: false }))
  } else {
    const st = runStage(ctx, { hook: 'onHitRoll', purpose: 'hit', count: total, actx, attackerPlayer, roller: attackerPlayer, needed: ew.skill, statics: hitMods, rend: 0, companion, unitId: attackerUnitId, targetUnitId: batch.targetUnitId, weaponId: ew.id, modelId: lead, onlySix: cardHit.onlySix })
    hitOuts = st.outs
    if (hitOnesTally) hitOnesTally.n += st.outs.filter((o) => o.u === 1).length
    // F12 (SKV-AB-3): hits scored by each critical hit, one roll per critical hit (attacker's roll) when the value is dice
    copiesOf = st.outs.map((o) => (o.success && o.critical && critAb === 'CRIT_2_HITS' ? critHitCount(ctx, critEntry?.value, attackerPlayer, attackerUnitId, lead, ew.id) : 1))
    st.outs.forEach((o, i) => ctx.emit({ type: 'HitRolled', attack: rctx, die: o.u, final: o.final, hit: o.success, critical: o.critical, extraHits: Math.max(0, copiesOf[i] - 1), auto: false, rollId: st.roll.id, dieIndex: i, player: attackerPlayer }))
    // F14 (MON-BT-2 Diseased): the attacking unit's own codes hear how many critical hits this weapon group scored
    const crits = st.outs.filter((o) => o.success && o.critical).length
    if (crits > 0) for (const ab of ownAbilityCodes(s, attacker)) codeHookFor(ab.code)?.onOwnCriticalHits?.(ctx, { ability: ab, unitId: attackerUnitId, weaponId: ew.id, count: crits })
  }
  let needWound = 0
  let autoWounds = 0
  let mortal = 0
  const dmgMods = damageModifiers(ctx, actx)
  hitOuts.forEach((o, i) => {
    if (!o.success) return
    if (hitMortal) { mortal += mortalPerHit(ctx, hitMortal.value, attackerPlayer, attackerUnitId, lead, ew.id); return }
    if (o.critical && critAb === 'CRIT_MORTAL') { mortal += damageOf(ctx, ew, actx, attackerPlayer, dmgMods); return }
    const copies = copiesOf[i] ?? 1
    if (o.critical && critAb === 'CRIT_AUTO_WOUND') autoWounds += copies
    else needWound += copies
  })
  addToPool(pools, batch.targetUnitId, mortal, by, rctx, true, attackerUnitId)

  // 2. wound
  let wounds = autoWounds
  if (needWound > 0) {
    const woundCard = cardWoundModifier(s, attackerPlayer, batch.targetUnitId)
    const st = runStage(ctx, { hook: 'onWoundRoll', purpose: 'wound', count: needWound, actx, attackerPlayer, roller: attackerPlayer, needed: ew.wound, statics: woundCard ? [{ source: 'card', value: woundCard }] : [], rend: 0, companion, unitId: attackerUnitId, targetUnitId: batch.targetUnitId, weaponId: ew.id, modelId: lead })
    st.outs.forEach((o, i) => ctx.emit({ type: 'WoundRolled', attack: rctx, die: o.u, final: o.final, needed: ew.wound, wounded: o.success, critical: false, auto: false, rollId: st.roll.id, dieIndex: i, player: attackerPlayer }))
    wounds += st.outs.filter((o) => o.success).length
  }
  if (wounds <= 0) return

  // 3. save
  const stats = modelStats(s, rep)
  let unsaved = wounds
  if (!stats.noSave) {
    const sv = clampStat('Sv', hookService.statFor ? hookService.statFor(s, { unitId: batch.targetUnitId, modelId: rep.id, weapon: null, stat: 'Sv', attack: actx }, stats.Sv) : stats.Sv)
    const saveCard = cardSaveModifier(s, batch.targetUnitId)
    const st = runStage(ctx, { hook: 'onSaveRoll', purpose: 'save', count: wounds, actx, attackerPlayer, roller: targetPlayer, needed: sv, statics: saveCard ? [{ source: 'card', value: saveCard }] : [], rend, companion: false, unitId: batch.targetUnitId, targetUnitId: batch.targetUnitId, weaponId: ew.id, modelId: rep.id })
    st.outs.forEach((o, i) => ctx.emit({ type: 'SaveRolled', attack: rctx, modelId: rep.id, kind: 'armour', die: o.u, final: o.final, needed: sv, saved: o.success, rollId: st.roll.id, dieIndex: i, player: targetPlayer }))
    unsaved = st.outs.filter((o) => !o.success).length
    // F12 (SER C4): unmodified 1s on save dice, per target unit, for EngineCodeHook.afterAttackSequence
    const ones = st.outs.filter((o) => o.u === 1).length
    if (saveOnesTally && ones > 0) saveOnesTally[batch.targetUnitId] = (saveOnesTally[batch.targetUnitId] ?? 0) + ones
  }

  // 4. damage
  let points = 0
  for (let i = 0; i < unsaved; i++) points += damageOf(ctx, ew, actx, attackerPlayer, dmgMods)
  addToPool(pools, batch.targetUnitId, points, by, rctx, false, attackerUnitId)
}

// damage modifiers from onDamage hooks (defender-side reductions, attacker-side bonuses); collected once per batch
function damageModifiers(ctx: EngineContext, actx: AttackContext): { delta: number; halve: boolean; reduction: number; set: number | null } {
  const out = { delta: 0, halve: false, reduction: 0, set: null as number | null }
  const tm = actx.targetModelId
  if (!tm) return out
  for (const r of ctx.services.hooks.collect(ctx, 'onDamage', { attack: actx, targetUnitId: actx.targetUnitId, targetModelId: tm, damage: 1, mortal: false })) {
    if (r.result.kind !== 'damage') continue
    out.delta += r.result.delta ?? 0
    out.reduction += r.result.reduction ?? 0
    if (r.result.halve) out.halve = true
    if (r.result.set !== undefined) out.set = r.result.set
  }
  return out
}

// merges models with an identical profile against the same target into one fast-dice batch (CORE-11.9); target order =
// declare order, weapon order = declare order within a target
function buildBatches(ctx: EngineContext, kind: AttackKind, attackerUnitId: UnitId, targets: DeclaredTarget[]): Batch[] {
  const s = ctx.state
  const counts = targets.map((t) => t.attacks ?? rollAttackCount(ctx, t.modelId, t.weaponId, t.targetUnitId))
  const bearer = (m: ModelId): boolean => Object.values(s.abilities).some((a) => a.bearerModelId === m)
  const batches = new Map<string, Batch>()
  const order: string[] = []
  const targetOrder: UnitId[] = []
  for (const t of targets) if (!targetOrder.includes(t.targetUnitId)) targetOrder.push(t.targetUnitId)
  for (const tu of targetOrder) {
    targets.forEach((t, i) => {
      if (t.targetUnitId !== tu || counts[i] <= 0) return
      const w = weaponService.effectiveWeapon(s, t.modelId, t.weaponId)
      const key = JSON.stringify([tu, t.weaponId, w.skill, w.wound, w.rend, w.D, w.abilities, bearer(t.modelId) ? t.modelId : ''])
      let b = batches.get(key)
      if (!b) { b = { targetUnitId: tu, weaponId: t.weaponId, entries: [] }; batches.set(key, b); order.push(key) }
      b.entries.push({ modelId: t.modelId, n: counts[i] })
      if (kind === 'melee') recordModelAttacked(s, t.modelId)
    })
  }
  void attackerUnitId
  return order.map((k) => batches.get(k) as Batch)
}

// ---------- damage pools (CORE-13) ----------
// F16 (OBR C1): `kind` = the damage pool's DestroyedBy kind (null = not asked from a pool). With an attacker and a kind, a source
// whose EngineCodeHook.forbidsWard answers true removes the ward roll altogether (hookService.wardForbidden)
function wardThreshold(ctx: EngineContext, unitId: UnitId, rep: Model, mortal: boolean, attackerUnitId: UnitId | null, kind: DestroyedBy['kind'] | null = null): { needed: number; modifier: number } | null {
  const s = ctx.state
  if (attackerUnitId && kind && hookService.wardForbidden(s, { wardedUnitId: unitId, attackerUnitId, kind })) return null
  let best: number | null = modelStats(s, rep).ward
  const core = datasheetOf(s, unitId).coreAbilities.find((c) => c.ability === 'FEEL_NO_PAIN')
  if (core) { const v = typeof core.value === 'number' ? core.value : parseDiceExpr(core.value ?? 6).flat; best = best === null ? v : Math.min(best, v) }
  let modifier = 0
  const player = s.units[unitId].player
  const fake: DiceRoll = { id: 'fake', purpose: 'fnp', sides: 6, dice: [0], rerolled: null, modifiers: [], final: [0], player, unitId, modelId: rep.id, weaponId: null, targetUnitId: null, commandRerollable: false }
  for (const r of ctx.services.hooks.collect(ctx, 'onFeelNoPainRoll', { attack: nullActx(s, unitId, attackerUnitId), roll: { purpose: 'fnp', roll: fake, dieIndex: 0, unmodified: 0, rerolled: false }, mortal, psychicSource: false })) {
    if (r.result.kind !== 'roll') continue
    if (r.result.feelNoPain !== undefined) best = best === null ? r.result.feelNoPain : Math.min(best, r.result.feelNoPain)
    if (r.result.modifier) modifier += r.result.modifier
  }
  // code-hook wards that no data scope can express (FYR-AB-3 Duty Unto Death: the general's Ward 5+ while near the Hearthguard).
  // EngineCodeHook.adjustFeelNoPain is asked for every source on the board; only the best ward applies (CORE-13.2)
  const adj = hookService.feelNoPainAdjust(s, rep.id, best)
  if (adj) {
    if (adj.threshold !== null) best = best === null ? adj.threshold : Math.min(best, adj.threshold)
    modifier += adj.modifier
  }
  // F18 (OGM C4, EngineCodeHook.wardRollModifier): attacker-side modifiers to this ward roll (Exotic Giblets), before the clamp
  if (attackerUnitId && kind) modifier += hookService.wardRollModifierFor(s, { wardedUnitId: unitId, attackerUnitId, kind })
  // cards: Eroding Miasma / Fight to the Last / Shield of Thorns
  return cardWard(s, unitId, best === null ? null : { needed: best, modifier: Math.max(-1, Math.min(1, modifier)) })
}

// a champion model (composition `champion: true`: the Slaves Godspeaker, the Seraphon Sunblood)
function isChampion(state: GameState, m: Model): boolean {
  const ds = state.datasheets[state.units[m.unitId]?.datasheetId ?? '']
  return ds?.models.find((p) => p.modelId === m.datasheetModelId)?.champion === true
}

// the model that takes the next damage point: the damaged model first, then the model farthest from the attacker. F12 (SER C3):
// champion models take damage last (only once no other model is left)
function nextTarget(state: GameState, all: Model[], attackerUnitId: UnitId | null): Model {
  const damaged = all.filter((m) => m.woundsRemaining < modelStats(state, m).W)
  if (damaged.length > 0) return damaged.reduce((a, b) => (b.woundsRemaining < a.woundsRemaining ? b : a))
  const rank = all.filter((m) => !isChampion(state, m))
  const models = rank.length > 0 ? rank : all
  const att = attackerUnitId ? boardModels(state, attackerUnitId) : []
  if (att.length === 0) return models[models.length - 1]
  let best = models[0], bestD = -1
  for (const m of models) {
    const d = Math.min(...att.map((a) => distance(a, m)))
    if (d >= bestD - EPS) { best = m; bestD = Math.max(bestD, d) }
  }
  return best
}

function resolvePool(ctx: EngineContext, unitId: UnitId, pool: Pool): void {
  const s = ctx.state
  const unit = s.units[unitId]
  if (!unit || unit.location !== 'board') return
  let models = unitModels(s, unitId)
  if (models.length === 0) return
  const rep = models[0]
  const original = pool.points
  let points = original
  let warded = 0
  const ward = wardThreshold(ctx, unitId, rep, pool.mortal, pool.attackerUnitId, pool.by.kind)
  if (ward && points > 0) {
    const roll = ctx.roll({ purpose: 'fnp', player: unit.player, sides: 6, count: points, mode: 'perDie', unitId, modelId: rep.id, commandRerollable: false, needed: ward.needed })
    for (const die of roll.dice) {
      const ignored = die !== 1 && die + ward.modifier >= ward.needed
      if (ignored) warded++
      ctx.emit({ type: 'FeelNoPainRolled', unitId, modelId: rep.id, die, needed: ward.needed - ward.modifier, ignored, player: unit.player })
    }
    points -= warded
    afterWardRoll(ctx, unitId, [...roll.dice], ward.needed)
  }
  // F12 (SER C2): the first damage point allocated to the unit this phase may be ignored
  points = ignoreFirstPoint(ctx, unitId, points)
  // KRU-ENH Egomaniak (EngineCodeHook.redirectDamage, F8): after the ward, each remaining point may move to another unit
  const moved = points > 0 ? redirectPoints(ctx, unitId, points) : null
  if (moved) points -= moved.points
  if (points > 0 && pool.source && 'attackerUnitId' in pool.source && pool.by.kind === 'ranged' && pool.attackerUnitId) markShotDamage(s, pool.attackerUnitId, unitId)
  let slain = 0
  const dealt = new Map<ModelId, number>()
  while (points > 0 && models.length > 0) {
    const m = nextTarget(s, models, pool.attackerUnitId)
    const take = Math.min(points, m.woundsRemaining)
    m.woundsRemaining -= take
    points -= take
    dealt.set(m.id, (dealt.get(m.id) ?? 0) + take)
    tallyFightDamage(s, pool, take)
    if (m.woundsRemaining <= 0) {
      flushDamage(ctx, unit, dealt, pool)
      slain += slayModel(ctx, m.id, pool.by)
      if (s.units[unitId].location !== 'board') break
      slain += cullForCoherency(ctx, unitId, pool.by)
      if (s.units[unitId].location !== 'board') break
      models = unitModels(s, unitId)
    }
  }
  flushDamage(ctx, unit, dealt, pool)
  ctx.emit({ type: 'DamagePoolResolved', unitId, points: original, warded, slain, player: unit.player })
  // the moved points: allocated straight to the recipient's models, no second ward roll (they already took the first one)
  if (moved && s.units[moved.to]?.location === 'board') {
    ctx.emit({ type: 'DamageRedirected', fromUnitId: unitId, toUnitId: moved.to, points: moved.points, player: unit.player })
    allocatePoints(ctx, moved.to, moved.points, pool)
  }
}

// rolls the redirect dice (one per point, the defender's roll) and picks the recipient; null when nothing moves
function redirectPoints(ctx: EngineContext, unitId: UnitId, points: number): { to: UnitId; points: number } | null {
  const s = ctx.state
  const unit = s.units[unitId]
  const rd = hookService.damageRedirectFor(s, unitId)
  if (!rd) return null
  const wounds = (id: UnitId): number => unitModels(s, id).reduce((a, m) => a + m.woundsRemaining, 0)
  const cands = rd.candidates
    .filter((id) => id !== unitId && s.units[id]?.location === 'board' && s.units[id].player === unit.player && unitModels(s, id).length > 0)
    .sort((a, b) => wounds(b) - wounds(a) || (a < b ? -1 : a > b ? 1 : 0))
  if (cands.length === 0) return null
  const roll = ctx.roll({ purpose: 'ability', player: unit.player, sides: 6, count: points, mode: 'perDie', unitId, commandRerollable: false, needed: rd.succeedOn })
  const n = roll.dice.filter((d) => d >= rd.succeedOn).length
  return n > 0 ? { to: cands[0], points: n } : null
}

// damage points straight onto a unit's models (no ward): the allocation half of resolvePool
function allocatePoints(ctx: EngineContext, unitId: UnitId, points: number, pool: Pool): void {
  const s = ctx.state
  const unit = s.units[unitId]
  points = ignoreFirstPoint(ctx, unitId, points)
  let models = unitModels(s, unitId)
  let slain = 0
  const dealt = new Map<ModelId, number>()
  while (points > 0 && models.length > 0) {
    const m = nextTarget(s, models, pool.attackerUnitId)
    const take = Math.min(points, m.woundsRemaining)
    m.woundsRemaining -= take
    points -= take
    dealt.set(m.id, (dealt.get(m.id) ?? 0) + take)
    tallyFightDamage(s, pool, take)
    if (m.woundsRemaining <= 0) {
      flushDamage(ctx, unit, dealt, pool)
      slain += slayModel(ctx, m.id, pool.by)
      if (s.units[unitId].location !== 'board') break
      slain += cullForCoherency(ctx, unitId, pool.by)
      if (s.units[unitId].location !== 'board') break
      models = unitModels(s, unitId)
    }
  }
  flushDamage(ctx, unit, dealt, pool)
  ctx.emit({ type: 'DamagePoolResolved', unitId, points: 0, warded: 0, slain, player: unit.player })
}

// ---------- F12 helpers of the damage sequence ----------
// SCE-AB-4 (EngineCodeHook.afterWardRoll): every source entry held by the warded unit observes the roll
function afterWardRoll(ctx: EngineContext, unitId: UnitId, dice: number[], needed: number): void {
  for (const entry of sourcesFor(ctx.state)) {
    if (entry.holderUnitId !== unitId) continue
    codeHookFor(entry.code)?.afterWardRoll?.(ctx, entry, { unitId, dice, needed })
  }
}

// SER-AB-1 (EngineCodeHook.ignoresFirstDamagePerPhase): drops one point the first time the unit would take damage this phase
const IGNORE1 = 'ignore1:'
function ignoreFirstPoint(ctx: EngineContext, unitId: UnitId, points: number): number {
  const s = ctx.state
  if (points <= 0 || s.phaseState.marks.includes(IGNORE1 + unitId)) return points
  const source = hookService.ignoresFirstDamageBy(s, unitId)
  if (!source) return points
  s.phaseState.marks.push(IGNORE1 + unitId)
  ctx.emit({ type: 'DamageIgnored', unitId, points: 1, source, player: s.units[unitId].player })
  return points - 1
}

// SBG-BT-2 The Hunger: damage points a unit's melee attacks allocated this phase (after wards), phase mark fightDmg:<unitId>=<n>
const FIGHT_DMG = 'fightDmg:'
function tallyFightDamage(state: GameState, pool: Pool, take: number): void {
  if (take <= 0 || pool.by.kind !== 'melee' || !pool.by.unitId) return
  const key = `${FIGHT_DMG}${pool.by.unitId}=`
  const prev = state.phaseState.marks.find((m) => m.startsWith(key))
  const n = (prev ? Number(prev.slice(key.length)) : 0) + take
  state.phaseState.marks = state.phaseState.marks.filter((m) => !m.startsWith(key))
  state.phaseState.marks.push(key + n)
}
export function fightDamageAllocated(state: GameState, unitId: UnitId): number {
  const key = `${FIGHT_DMG}${unitId}=`
  const m = state.phaseState.marks.find((x) => x.startsWith(key))
  return m ? Number(m.slice(key.length)) : 0
}
export function clearFightDamage(state: GameState, unitId: UnitId): void {
  const key = `${FIGHT_DMG}${unitId}=`
  state.phaseState.marks = state.phaseState.marks.filter((m) => !m.startsWith(key))
}

// SBG-BT-2: a unit's Fight activation is over (phases/fight.ts, after deferred mortals): the codes of its datasheet abilities and its
// player's battle traits / regiment ability get EngineCodeHook.onOwnFightResolved with the damage it allocated; the tally is cleared
export function ownFightResolved(ctx: EngineContext, unitId: UnitId): void {
  const s = ctx.state
  const damageAllocated = fightDamageAllocated(s, unitId)
  clearFightDamage(s, unitId)
  const unit = s.units[unitId]
  if (!unit) return
  for (const ab of ownAbilityCodes(s, unit)) codeHookFor(ab.code)?.onOwnFightResolved?.(ctx, { ability: ab, unitId, damageAllocated })
}

// SER-AB-6 (EngineCodeHook.afterAttackSequence): every source entry on the board, once per (source, holder, active effect)
function afterAttackSequence(ctx: EngineContext, attackerUnitId: UnitId, saveOnes: Record<UnitId, number>, hitOnes: number, combat: boolean): void {
  const seen = new Set<string>()
  for (const entry of sourcesFor(ctx.state)) {
    const spec = codeHookFor(entry.code)
    if (!spec?.afterAttackSequence) continue
    const k = `${entry.source.id}|${entry.holderUnitId}|${entry.active?.id ?? ''}`
    if (seen.has(k)) continue
    seen.add(k)
    spec.afterAttackSequence(ctx, entry, { attackerUnitId, saveOnes: { ...saveOnes }, hitOnes, combat })
  }
}

// ---------- LRL-AB-3 Hurricane Winds (F8): who damaged whom with shooting attacks this phase ----------
const SHOT_DMG = 'shotDmg:'
function markShotDamage(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId): void {
  const key = `${SHOT_DMG}${attackerUnitId}>${targetUnitId}`
  if (!state.phaseState.marks.includes(key)) state.phaseState.marks.push(key)
}
// the units `attackerUnitId` allocated at least one damage point to with shooting attacks this phase (after wards)
export function damagedByShootingThisPhase(state: GameState, attackerUnitId: UnitId): UnitId[] {
  const prefix = `${SHOT_DMG}${attackerUnitId}>`
  return state.phaseState.marks.filter((m) => m.startsWith(prefix)).map((m) => m.slice(prefix.length))
}

function flushDamage(ctx: EngineContext, unit: Unit, dealt: Map<ModelId, number>, pool: Pool): void {
  for (const [modelId, amount] of dealt) {
    if (amount > 0) noteLedger(ctx.state, 'damaged', unit.id)
    const m = ctx.state.models[modelId]
    ctx.emit({ type: 'DamageApplied', unitId: unit.id, modelId, amount, mortal: pool.mortal, woundsRemaining: Math.max(0, m ? m.woundsRemaining : 0), source: pool.source, player: unit.player })
  }
  dealt.clear()
}

function slayModel(ctx: EngineContext, modelId: ModelId, by: DestroyedBy): number {
  if (!ctx.state.models[modelId]) return 0
  attackService.destroyModel(ctx, modelId, by)
  return 1
}

// CORE-13.5: after a removal the unit must be one coherent group; keep removing (fewest possible) until it is
function cullForCoherency(ctx: EngineContext, unitId: UnitId, by: DestroyedBy): number {
  const s = ctx.state
  const range = datasheetOf(s, unitId).coherencyRange
  let culled = 0
  const gone: ModelId[] = []
  for (let guard = 0; guard < 200; guard++) {
    const models = unitModels(s, unitId)
    if (models.length <= 1 || isCoherent(models, range)) break
    const groups = coherencyGroups(models, range)
    let victims: Model[]
    if (groups.length > 1) victims = groups.slice(1).flat().map((i) => models[i])
    else {
      // one connected group but some model lacks the neighbours a 7+ unit needs: drop the worst linked one
      const links = models.map((m) => models.filter((o) => o !== m && horizontalGap(m, o) <= (range ?? 0.5) + EPS).length)
      victims = [models[links.indexOf(Math.min(...links))]]
    }
    for (const v of victims) {
      gone.push(v.id)
      attackService.destroyModel(ctx, v.id, { ...by, kind: 'other' })
      culled++
    }
    if (s.units[unitId].location !== 'board') break
  }
  if (gone.length > 0) ctx.emit({ type: 'CoherencyCulled', unitId, modelIds: gone })
  return culled
}

function destroyUnitTail(ctx: EngineContext, unit: Unit, by: DestroyedBy): void {
  const s = ctx.state
  unit.destroyedBy = { player: by.player ?? s.activePlayer, kind: by.kind, round: s.round, unitId: by.unitId, modelId: by.modelId }
  ctx.emit({ type: 'UnitDestroyed', unitId: unit.id, byPlayer: by.player, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind })
  ctx.services.hooks.run(ctx, 'onUnitDestroyed', { destroyedUnitId: unit.id, destroyedModelId: null, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind })
  const ms = ctx.services.missions as unknown as { unitDestroyed?: (c: EngineContext, i: object) => void }
  ms.unitDestroyed?.(ctx, { unitId: unit.id, byPlayer: by.player, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind, rangedAttack: by.kind === 'ranged' })
}

function resolvePools(ctx: EngineContext, pools: Pools): void {
  const s = ctx.state
  // CORE-13.1: the active player's units first (a stable sort: otherwise in the order the pools were opened)
  const list = [...pools.values()].sort((a, b) => Number(s.units[a.unitId].player !== s.activePlayer) - Number(s.units[b.unitId].player !== s.activePlayer))
  for (const pool of list) resolvePool(ctx, pool.unitId, pool)
}

// ---------- service ----------
export const attackService: AttackService = {
  begin(ctx, spec) {
    const s = ctx.state
    const prev = s.phaseState.attack
    const targets = spec.targets.filter((t) => s.models[t.modelId] && weaponService.isAvailable(s, t.modelId, t.weaponId))
    const targetUnitIds = [...new Set(targets.map((t) => t.targetUnitId))]
    const groups: AttackGroup[] = []
    for (const tu of targetUnitIds) {
      for (const wid of [...new Set(targets.filter((t) => t.targetUnitId === tu).map((t) => t.weaponId))]) {
        const mine = targets.filter((t) => t.targetUnitId === tu && t.weaponId === wid)
        groups.push({ weaponId: wid, targetUnitId: tu, attackerModelIds: mine.map((t) => t.modelId), attacks: mine.reduce((a, t) => a + (t.attacks ?? 0), 0), resolved: 0, devastatingPending: 0 })
      }
    }
    s.phaseState.attack = {
      kind: spec.kind, attackerUnitId: spec.attackerUnitId, overwatch: false, targets, groups, current: null,
      mortalQueue: prev?.mortalQueue ?? [], hazardousPending: [], targetUnitIds,
    }
    if (targets.length === 0) return
    if (spec.kind === 'ranged') recordShot(s, spec.attackerUnitId)
    // F14 (NH-ENH Cloaked in Shadow): the first unit to declare attacks on each target this phase (firstAttackerThisPhase)
    for (const tu of targetUnitIds) if (firstAttackerThisPhase(s, tu) === null) s.phaseState.marks.push(`${FIRST_ATK}${tu}=${spec.attackerUnitId}`)
    ctx.emit({ type: 'AttackSequenceStarted', unitId: spec.attackerUnitId, kind: spec.kind, overwatch: false })
    ctx.emit({ type: 'TargetsDeclared', unitId: spec.attackerUnitId, targets: targets.map((t) => ({ modelId: t.modelId, weaponId: t.weaponId, targetUnitId: t.targetUnitId })) })
    ctx.services.hooks.run(ctx, 'onTargetsDeclared', { attackerUnitId: spec.attackerUnitId, targetUnitIds, kind: spec.kind })
  },

  advance(ctx) {
    const s = ctx.state
    const a = s.phaseState.attack
    if (!a) return 'done'
    const pools: Pools = new Map()
    const live = a.targets.filter((t) => s.units[t.targetUnitId]?.location === 'board')
    const tally: Record<UnitId, number> = {}
    const hitOnes = { n: 0 }
    // F14 (core 20.0): the attacker picks one crit ability per weapon that has several, before any dice
    if (live.length > 0 && askCritChoice(ctx, a.kind, a.attackerUnitId, live)) return 'pending'
    if (live.length > 0) {
      const batches = buildBatches(ctx, a.kind, a.attackerUnitId, live)
      saveOnesTally = tally
      hitOnesTally = hitOnes
      try { for (const b of batches) resolveBatch(ctx, a.kind, a.attackerUnitId, b, pools) } finally { saveOnesTally = null; hitOnesTally = null }
      for (const g of a.groups) g.resolved = g.attacks
    }
    // mortal damage queued during the ability joins the same pools (CORE-13.3)
    const queue = a.mortalQueue
    a.mortalQueue = []
    for (const q of queue) {
      const by: DestroyedBy = q.by ? { player: q.by.player, unitId: q.by.unitId, modelId: q.by.modelId, kind: 'mortal', ...(q.by.psychic ? { psychic: true } : {}) } : { player: null, unitId: null, modelId: null, kind: 'mortal' }
      addToPool(pools, q.targetUnitId, q.count, by, { abilityId: q.source.split('#')[0] }, true, q.by?.unitId ?? null)
    }
    resolvePools(ctx, pools)
    const ran = live.length > 0 || a.targets.length > 0
    if (ran) ctx.emit({ type: 'AttackSequenceEnded', unitId: a.attackerUnitId, kind: a.kind })
    s.phaseState.attack = null
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith(`${CRIT_PICK}${a.attackerUnitId}|`))
    if (ran) afterAttackSequence(ctx, a.attackerUnitId, tally, hitOnes.n, a.kind === 'melee')
    return 'done'
  },

  // F14: answers the 'critChoice' pick (DEFAULT_MODULES.topics); the attack resumes when the phase module calls advance again
  handler: {
    validate(_state, action, pending) {
      if (pending.kind !== 'chooseOption' || pending.context.topic !== 'critChoice') return { code: 'E_NOT_AN_OPTION', reason: 'attack: only the crit pick is asked here' }
      if (action.type !== 'chooseOption' || !pending.options.some((o) => o.id === action.optionId)) return { code: 'E_NOT_AN_OPTION', reason: 'pick one of the offered critical-hit abilities' }
      return null
    },
    handle(ctx, action, pending) {
      const rej = attackService.handler.validate?.(ctx.state, action, pending)
      if (rej) return rej
      if (pending.kind !== 'chooseOption' || action.type !== 'chooseOption') return
      const key = pending.context.data.key as string
      ctx.state.phaseState.marks = ctx.state.phaseState.marks.filter((m) => !m.startsWith(key))
      ctx.state.phaseState.marks.push(key + action.optionId)
      ctx.emit({ type: 'AbilityTriggered', abilityId: 'core.crit-choice', sourceUnitId: pending.context.unitId, targetUnitId: (pending.context.data.targetUnitId as UnitId) ?? null, summary: `${pending.options.find((o) => o.id === action.optionId)?.label ?? action.optionId} for this attack`, player: pending.player })
    },
  },

  queueMortalWounds(ctx, targetUnitId, count, source, lostOnDeath, by) {
    if (count <= 0) return
    const a = ctx.state.phaseState.attack
    if (a) { a.mortalQueue.push({ targetUnitId, count, source, lostOnDeath, ...(by ? { by } : {}) }); return }
    // no sequence running: the mortal damage is its own tiny ability (pool + ward + allocation) and resolves now
    const pools: Pools = new Map()
    const dby: DestroyedBy = by ? { player: by.player, unitId: by.unitId, modelId: by.modelId, kind: 'mortal', ...(by.psychic ? { psychic: true } : {}) } : { player: null, unitId: null, modelId: null, kind: 'mortal' }
    addToPool(pools, targetUnitId, count, dby, { abilityId: source.split('#')[0] }, true, by?.unitId ?? null)
    resolvePools(ctx, pools)
  },

  destroyModel(ctx, modelId, by) { attackService.finishDestroy(ctx, modelId, by) },

  finishDestroy(ctx, modelId, by) {
    const s = ctx.state
    const model = s.models[modelId]
    if (!model) return
    const unit = s.units[model.unitId]
    const nowDestroyed = removeModel(s, modelId)
    noteLedger(s, 'lostModels', unit.id)
    ctx.emit({ type: 'ModelDestroyed', unitId: unit.id, modelId, byPlayer: by.player, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind })
    ctx.services.hooks.run(ctx, 'onModelDestroyed', { destroyedUnitId: unit.id, destroyedModelId: modelId, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind })
    ownModelSlain(ctx, unit, by)
    // F14 (BOK C1 / NH C2): the slaying unit's ledger and its own sources' onEnemyModelSlain
    if (by.unitId && by.player !== null && by.player !== unit.player) {
      if (by.kind === 'melee') noteLedger(s, 'slewInFight', by.unitId)
      enemyModelSlain(ctx, unit, by)
    }
    const ms = ctx.services.missions as unknown as { modelDestroyed?: (c: EngineContext, i: object) => void }
    ms.modelDestroyed?.(ctx, { unitId: unit.id, modelId, byPlayer: by.player, byUnitId: by.unitId, byModelId: by.modelId })
    if (nowDestroyed) destroyUnitTail(ctx, unit, by)
  },

  removeDeclaredTargets(ctx, pred) {
    const a = ctx.state.phaseState.attack
    if (!a) throw new EngineInvariantError('attack.removeDeclaredTargets: no active sequence')
    const removed = a.targets.filter(pred)
    a.targets = a.targets.filter((t) => !pred(t))
    a.targetUnitIds = [...new Set(a.targets.map((t) => t.targetUnitId))]
    return removed
  },

  dropAttackerModels(ctx, modelIds) {
    const a = ctx.state.phaseState.attack
    if (!a) throw new EngineInvariantError('attack.dropAttackerModels: no active sequence')
    a.targets = a.targets.filter((t) => !modelIds.includes(t.modelId))
    a.targetUnitIds = [...new Set(a.targets.map((t) => t.targetUnitId))]
  },

  appendDeclaredTargets(ctx, targets) {
    const a = ctx.state.phaseState.attack
    if (!a) throw new EngineInvariantError('attack.appendDeclaredTargets: no active sequence')
    a.targets = [...a.targets, ...targets]
    a.targetUnitIds = [...new Set(a.targets.map((t) => t.targetUnitId))]
  },
}

// ---------- death triggers of the slain model's own unit (STD-AB-4 Glorious Death) ----------
// EngineCodeHook.onOwnModelSlain runs for the datasheet abilities of the unit a model was slain from (plus its player's battle
// traits / regiment ability), also when that model was the unit's last: the ordinary onModelDestroyed dispatch skips wiped units.
// `model` is the snapshot taken at removal (position and wounds at the moment it was slain).
function ownModelSlain(ctx: EngineContext, unit: Unit, by: DestroyedBy): void {
  const model = unit.destroyedModels?.[unit.destroyedModels.length - 1]
  if (!model) return
  for (const ab of ownAbilityCodes(ctx.state, unit)) codeHookFor(ab.code)?.onOwnModelSlain?.(ctx, { ability: ab, unitId: unit.id, model, by })
}

// F14 (NH C2, Soulfire Ring): EngineCodeHook.onEnemyModelSlain for every source entry HELD by the slaying unit (by.unitId), once
// per (source, active effect), after the enemy model is removed. `model` = the snapshot at removal.
function enemyModelSlain(ctx: EngineContext, unit: Unit, by: DestroyedBy): void {
  const model = unit.destroyedModels?.[unit.destroyedModels.length - 1]
  if (!model || !by.unitId) return
  const seen = new Set<string>()
  for (const entry of sourcesFor(ctx.state)) {
    if (entry.holderUnitId !== by.unitId) continue
    const spec = codeHookFor(entry.code)
    if (!spec?.onEnemyModelSlain) continue
    const k = `${entry.source.id}|${entry.active?.id ?? ''}`
    if (seen.has(k)) continue
    seen.add(k)
    spec.onEnemyModelSlain(ctx, entry, { slainUnitId: unit.id, model, by })
  }
}

// the unit's datasheet abilities plus its player's battle traits and regiment ability, de-duplicated, in that order
function ownAbilityCodes(s: GameState, unit: Unit): RuntimeAbility[] {
  const ds = s.datasheets[unit.datasheetId]
  const owner = s.players[unit.player]
  const ids = [...(ds?.abilities ?? []), ...(owner?.battleTraitIds ?? []), ...(owner?.regimentAbilityId ? [owner.regimentAbilityId] : [])]
  const out: RuntimeAbility[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const ab = s.abilities[id]
    if (!ab || seen.has(id)) continue
    seen.add(id)
    out.push(ab)
  }
  return out
}

// ---------- mortal damage held until a Fight ability has resolved (STD-AB-4 Glorious Death) ----------
// A hook queues mortal damage here during a combat attack sequence; phases/fight.ts drains it once the fighting unit's whole
// Fight activation is over (after the fight.attacksResolved window), through the ordinary damage sequence (ward applies).
export interface DeferredMortal { targetUnitId: UnitId; count: number; source: string; player: PlayerId }
const AFTER_FIGHT = 'afterFight:'

export function deferMortalAfterFight(state: GameState, d: DeferredMortal): void {
  if (d.count > 0) state.phaseState.marks.push(AFTER_FIGHT + JSON.stringify(d))
}

export function pendingAfterFightMortal(state: GameState): DeferredMortal[] {
  return state.phaseState.marks.filter((m) => m.startsWith(AFTER_FIGHT)).map((m) => JSON.parse(m.slice(AFTER_FIGHT.length)) as DeferredMortal)
}

// resolves every held entry (one pool per entry, in queue order); targets no longer on the board are skipped
export function drainAfterFightMortal(ctx: EngineContext): void {
  const s = ctx.state
  const list = pendingAfterFightMortal(s)
  if (list.length === 0) return
  s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith(AFTER_FIGHT))
  for (const d of list) {
    if (s.units[d.targetUnitId]?.location !== 'board') continue
    attackService.queueMortalWounds(ctx, d.targetUnitId, d.count, d.source, false)
  }
}

// ---------- 42k compatibility surface (WP8 deletes the importers) ----------
export const REACTIVE_MOVED_PREFIX = 'reactiveMoved:'
export function pruneUnreachableTargets(_ctx: EngineContext, _attackerUnitId: UnitId): void { /* no reactive moves in AoS */ }
export type SaveKind = 'armour' | 'invuln'
export interface DeathReactionRequest { modelId: ModelId; unitId: UnitId; player: PlayerId; attackerUnitId: UnitId; pos: Vec3; phase: GameState['phase'] }
export function pendingDeathReaction(_state: GameState): DeathReactionRequest | null { return null }
export function consumeDeathReaction(_state: GameState, _modelId: ModelId): void { /* none */ }
export function finishMartyrRemoval(ctx: EngineContext, modelId: ModelId, by: DestroyedBy): void { attackService.finishDestroy(ctx, modelId, by) }
export function psychicKillThisPhase(_state: GameState, _player: PlayerId): boolean { return false }
export function unitsHitByWeapon(_state: GameState, _attackerUnitId: UnitId, _weaponDataId: string): UnitId[] { return [] }
export function feelNoPainFor(ctx: EngineContext, modelId: ModelId, _actx: AttackContext, mortal = false): { threshold: number; modifier: number } | null {
  const m = ctx.state.models[modelId]
  if (!m) return null
  const w = wardThreshold(ctx, m.unitId, m, mortal, null)
  return w ? { threshold: w.needed, modifier: w.modifier } : null
}
export function damageRerollKinds(_ctx: EngineContext, _actx: AttackContext, _roll: DiceRoll): Set<'ones' | 'fails' | 'all'> { return new Set() }
