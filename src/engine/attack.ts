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
import type { WeaponAbilityName } from '../data/types'
import { clampHitWoundModifier, clampStat, netSaveModifier, parseDiceExpr } from './dice'
import type { AttackRollContext } from './events'
import { coherencyGroups, distance, ENGAGEMENT_H, EPS, horizontalGap, isCoherent } from './geometry'
import type { AttackContext, RollModifierResult } from './hooks'
import { hookService } from './hooks-impl'
import { cardChargeDamage, cardHitRule, cardIgnoresRend, cardSaveModifier, cardWard, cardWoundModifier } from './cardFlags'
import { losService } from './los'
import type { AdvanceResult, DecisionHandler, EngineContext } from './modules'
import { datasheetOf, keywordsOf, modelStats, recordModelAttacked, removeModel, unitModels } from './state'
import { weaponService } from './weapons'
import {
  EngineInvariantError,
  type AttackGroup, type AttackKind, type DeclaredTarget, type DiceRoll, type GameState, type Model, type ModelId, type PlayerId,
  type RollModifier, type RuntimeWeapon, type Unit, type UnitId, type Vec3, type WeaponId,
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
  const weapon = companion ? base : weaponService.effectiveWeapon(s, modelId, weaponId)
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
  type Ent = { mods: number[]; ignore: boolean; autoPass: boolean; autoFail: boolean; crit: number; rr: { kind: string; id: string }[] }
  const cache = new Map<number, Ent>()
  const entFor = (u: number, idx: number, roll: DiceRoll): Ent => {
    const hit = cache.get(u)
    if (hit) return hit
    const ent: Ent = { mods: [], ignore: false, autoPass: false, autoFail: false, crit: 7, rr: [] }
    const got = hookService.collect(ctx, p.hook, { attack: p.actx, roll: { purpose: p.purpose, roll, dieIndex: idx, unmodified: u, rerolled: false } })
    for (const g of got) {
      if (g.result.kind !== 'roll') continue
      const r = g.result as RollModifierResult
      // CORE-12.4 Companion: friendly buffs do not apply, negative modifiers and enemy abilities still do
      const friendly = !!g.source.unitId && s.units[g.source.unitId]?.player === p.attackerPlayer
      if (p.companion && !isSave && friendly && (r.modifier ?? 0) > 0) continue
      if (r.modifier) ent.mods.push(r.modifier)
      if (r.ignoreModifiers) ent.ignore = true
      if (r.autoPass) ent.autoPass = true
      if (r.autoFail) ent.autoFail = true
      if (r.critThreshold !== undefined) ent.crit = Math.min(ent.crit, r.critThreshold)
      if (r.reroll) ent.rr.push({ kind: r.reroll, id: g.source.id })
    }
    cache.set(u, ent)
    return ent
  }
  const evalDie = (u: number, idx: number, roll: DiceRoll): DieOut & { rr: Ent['rr'] } => {
    const ent = entFor(u, idx, roll)
    let final: number
    if (isSave) {
      const mods = [...p.statics.map((m) => m.value), ...ent.mods]
      final = u - p.rend + (ent.ignore ? 0 : netSaveModifier(mods))
    } else {
      const sum = [...p.statics.map((m) => m.value), ...ent.mods].reduce((a, b) => a + b, 0)
      final = u + (ent.ignore ? 0 : clampHitWoundModifier(sum))
    }
    const success = !ent.autoFail && u !== 1 && (p.onlySix ? u === 6 : (ent.autoPass || final >= p.needed))
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

// ---------- pools ----------
interface Pool { points: number; by: DestroyedBy; source: AttackRollContext | { abilityId: string }; mortal: boolean; attackerUnitId: UnitId | null }

function addToPool(pools: Map<UnitId, Pool>, unitId: UnitId, points: number, by: DestroyedBy, source: Pool['source'], mortal: boolean, attackerUnitId: UnitId | null): void {
  if (points <= 0) return
  const p = pools.get(unitId)
  if (p) p.points += points
  else pools.set(unitId, { points, by, source, mortal, attackerUnitId })
}

// ---------- resolving the declared attacks ----------
interface Entry { modelId: ModelId; n: number }
interface Batch { targetUnitId: UnitId; weaponId: WeaponId; entries: Entry[] }

function resolveBatch(ctx: EngineContext, kind: AttackKind, attackerUnitId: UnitId, batch: Batch, pools: Map<UnitId, Pool>): void {
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
  const draft = companion ? base : weaponService.effectiveWeapon(s, lead, batch.weaponId)
  const cover = coverFor(s, attackerUnitId, batch.targetUnitId)
  const actx0 = buildActx(ctx, kind, attackerUnitId, lead, draft, batch.targetUnitId, rep.id, cover)
  const ew = companion ? base : weaponService.effectiveWeapon(s, lead, batch.weaponId, actx0)
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
  let hitOuts: DieOut[]
  if (ew.skill === null) {
    hitOuts = Array.from({ length: total }, () => ({ u: 0, final: 0, success: true, critical: false }))
  } else {
    const st = runStage(ctx, { hook: 'onHitRoll', purpose: 'hit', count: total, actx, attackerPlayer, roller: attackerPlayer, needed: ew.skill, statics: hitMods, rend: 0, companion, unitId: attackerUnitId, targetUnitId: batch.targetUnitId, weaponId: ew.id, modelId: lead, onlySix: cardHit.onlySix })
    hitOuts = st.outs
    st.outs.forEach((o, i) => ctx.emit({ type: 'HitRolled', attack: rctx, die: o.u, final: o.final, hit: o.success, critical: o.critical, extraHits: o.critical && hasAb(ew, 'CRIT_2_HITS') ? 1 : 0, auto: false, rollId: st.roll.id, dieIndex: i, player: attackerPlayer }))
  }
  // criticals: one crit ability per weapon (CORE-12.1, first listed)
  const critAb = ew.abilities.find((a) => a.ability === 'CRIT_MORTAL' || a.ability === 'CRIT_2_HITS' || a.ability === 'CRIT_AUTO_WOUND')?.ability
  let needWound = 0
  let autoWounds = 0
  let mortal = 0
  const dmgMods = damageModifiers(ctx, actx)
  for (const o of hitOuts) {
    if (!o.success) continue
    if (o.critical && critAb === 'CRIT_MORTAL') { mortal += damageOf(ctx, ew, actx, attackerPlayer, dmgMods); continue }
    const copies = o.critical && critAb === 'CRIT_2_HITS' ? 2 : 1
    if (o.critical && critAb === 'CRIT_AUTO_WOUND') autoWounds += copies
    else needWound += copies
  }
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
      const w = hasAb(s.weapons[t.weaponId], 'COMPANION') ? s.weapons[t.weaponId] : weaponService.effectiveWeapon(s, t.modelId, t.weaponId)
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
function wardThreshold(ctx: EngineContext, unitId: UnitId, rep: Model, mortal: boolean, attackerUnitId: UnitId | null): { needed: number; modifier: number } | null {
  const s = ctx.state
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
  // cards: Eroding Miasma / Fight to the Last / Shield of Thorns
  return cardWard(s, unitId, best === null ? null : { needed: best, modifier: Math.max(-1, Math.min(1, modifier)) })
}

// the model that takes the next damage point: the damaged model first, then the model farthest from the attacker
function nextTarget(state: GameState, models: Model[], attackerUnitId: UnitId | null): Model {
  const damaged = models.filter((m) => m.woundsRemaining < modelStats(state, m).W)
  if (damaged.length > 0) return damaged.reduce((a, b) => (b.woundsRemaining < a.woundsRemaining ? b : a))
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
  const ward = wardThreshold(ctx, unitId, rep, pool.mortal, pool.attackerUnitId)
  if (ward && points > 0) {
    const roll = ctx.roll({ purpose: 'fnp', player: unit.player, sides: 6, count: points, mode: 'perDie', unitId, modelId: rep.id, commandRerollable: false, needed: ward.needed })
    for (const die of roll.dice) {
      const ignored = die !== 1 && die + ward.modifier >= ward.needed
      if (ignored) warded++
      ctx.emit({ type: 'FeelNoPainRolled', unitId, modelId: rep.id, die, needed: ward.needed - ward.modifier, ignored, player: unit.player })
    }
    points -= warded
  }
  let slain = 0
  const dealt = new Map<ModelId, number>()
  while (points > 0 && models.length > 0) {
    const m = nextTarget(s, models, pool.attackerUnitId)
    const take = Math.min(points, m.woundsRemaining)
    m.woundsRemaining -= take
    points -= take
    dealt.set(m.id, (dealt.get(m.id) ?? 0) + take)
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
}

function flushDamage(ctx: EngineContext, unit: Unit, dealt: Map<ModelId, number>, pool: Pool): void {
  for (const [modelId, amount] of dealt) {
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

function resolvePools(ctx: EngineContext, pools: Map<UnitId, Pool>): void {
  const s = ctx.state
  // CORE-13.1: the active player's units first
  const ids = [...pools.keys()].sort((a, b) => Number(s.units[a].player !== s.activePlayer) - Number(s.units[b].player !== s.activePlayer))
  for (const id of ids) resolvePool(ctx, id, pools.get(id) as Pool)
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
    ctx.emit({ type: 'AttackSequenceStarted', unitId: spec.attackerUnitId, kind: spec.kind, overwatch: false })
    ctx.emit({ type: 'TargetsDeclared', unitId: spec.attackerUnitId, targets: targets.map((t) => ({ modelId: t.modelId, weaponId: t.weaponId, targetUnitId: t.targetUnitId })) })
    ctx.services.hooks.run(ctx, 'onTargetsDeclared', { attackerUnitId: spec.attackerUnitId, targetUnitIds, kind: spec.kind })
  },

  advance(ctx) {
    const s = ctx.state
    const a = s.phaseState.attack
    if (!a) return 'done'
    const pools = new Map<UnitId, Pool>()
    const live = a.targets.filter((t) => s.units[t.targetUnitId]?.location === 'board')
    if (live.length > 0) {
      const batches = buildBatches(ctx, a.kind, a.attackerUnitId, live)
      for (const b of batches) resolveBatch(ctx, a.kind, a.attackerUnitId, b, pools)
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
    if (live.length > 0 || a.targets.length > 0) ctx.emit({ type: 'AttackSequenceEnded', unitId: a.attackerUnitId, kind: a.kind })
    s.phaseState.attack = null
    return 'done'
  },

  handler: { handle: () => ({ code: 'E_NOT_AN_OPTION', reason: 'attack: the attack sequence asks no decisions' }) },

  queueMortalWounds(ctx, targetUnitId, count, source, lostOnDeath, by) {
    if (count <= 0) return
    const a = ctx.state.phaseState.attack
    if (a) { a.mortalQueue.push({ targetUnitId, count, source, lostOnDeath, ...(by ? { by } : {}) }); return }
    // no sequence running: the mortal damage is its own tiny ability (pool + ward + allocation) and resolves now
    const pools = new Map<UnitId, Pool>()
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
    ctx.emit({ type: 'ModelDestroyed', unitId: unit.id, modelId, byPlayer: by.player, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind })
    ctx.services.hooks.run(ctx, 'onModelDestroyed', { destroyedUnitId: unit.id, destroyedModelId: modelId, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind })
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
