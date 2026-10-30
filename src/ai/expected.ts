// Cheap expected-damage / value heuristics for the AI (docs/spec/40-ai.md, simplified: playable first). Pure
// functions of GameState; never roll dice, never mutate. Spearhead maths (CORE-11/12/13): Attacks x Hit x Wound,
// then the target's Save worsened by Rend (no floor, +1 cap on bonuses), then Ward per damage point. Crit abilities
// and Anti-X are approximated; there is no points data at runtime so "value" comes from stats.
import { diceExprMean } from '../engine/dice'
import { boardModelsOf, hasKeyword, keywordsOf, modelStats, unitModels } from '../engine/state'
import { weaponService } from '../engine/weapons'
import type { GameState, ModelId, PlayerId, UnitId, WeaponId } from '../engine/types'

/** P(d6 >= target), clamped to [1/6, 5/6] (unmodified 1 always fails, and a roll can never be certain). */
function rollP(target: number, mod = 0): number {
  const capped = Math.max(-1, Math.min(1, mod))
  const t = target - capped
  return Math.max(1 / 6, Math.min(5 / 6, (7 - t) / 6))
}

export interface AttackOptions {
  charged?: boolean // the attacker's unit charged this turn (Charge (+1 Damage))
  cover?: boolean // target has Cover (-1 to hit)
  hitMod?: number
  woundMod?: number
}

export interface AttackEstimate { damage: number; modelsKilled: number }

const NO_DAMAGE: AttackEstimate = { damage: 0, modelsKilled: 0 }

// representative defending model: the first living model (allocation order is not modelled; fine for prioritising)
function representativeDefender(state: GameState, targetUnitId: UnitId): ModelId | null {
  const models = unitModels(state, targetUnitId)
  return models.length > 0 ? models[0].id : null
}

/** Expected damage one model's one use of one weapon deals to a target unit, plus a rough models-killed estimate.
 *  `attacks` overrides the weapon's own Attacks (declareTargets context carries the real per-(model, weapon) count). */
export function expectedAttack(
  state: GameState, attackerModelId: ModelId, weaponId: WeaponId, targetUnitId: UnitId,
  opts: AttackOptions = {}, attacks?: number,
): AttackEstimate {
  const attacker = state.models[attackerModelId]
  const target = state.units[targetUnitId]
  if (!attacker || !target || target.location !== 'board') return NO_DAMAGE
  const defenderId = representativeDefender(state, targetUnitId)
  if (!defenderId) return NO_DAMAGE
  const defender = state.models[defenderId]
  const weapon = weaponService.effectiveWeapon(state, attackerModelId, weaponId)
  if (!weapon) return NO_DAMAGE
  const tStats = modelStats(state, defender)

  const n = attacks ?? diceExprMean(weapon.A)
  const hit = weapon.skill === null ? 1 : rollP(weapon.skill, opts.hitMod ?? (opts.cover ? -1 : 0))
  const wound = rollP(weapon.wound, opts.woundMod ?? 0)
  let hits = n * hit
  if (weaponService.hasAbility(weapon, 'CRIT_2_HITS')) hits += n / 6
  let wounds = hits * wound
  if (weaponService.hasAbility(weapon, 'CRIT_AUTO_WOUND')) wounds += hits * (1 / 6) * (1 - wound)

  let rend = weapon.rend
  const tKeywords = keywordsOf(state, targetUnitId)
  const anti = weapon.abilities.find((a) => a.ability === 'ANTI' && (a.keyword ? tKeywords.includes(a.keyword) : false))
  if (anti) rend += 1
  const save = tStats.noSave ? 7 : tStats.Sv + rend
  const failSave = save >= 7 ? 1 : save <= 2 ? 1 / 6 : (save - 1) / 6
  let dmgPer = diceExprMean(weapon.D)
  if (opts.charged && weaponService.hasAbility(weapon, 'CHARGE_DAMAGE')) dmgPer += 1
  let damage = wounds * failSave * dmgPer
  if (weaponService.hasAbility(weapon, 'CRIT_MORTAL')) damage += hits * (1 / 6) * dmgPer
  if (tStats.ward !== null) damage *= 1 - rollP(tStats.ward, 0)

  const W = Math.max(1, tStats.W)
  return { damage, modelsKilled: Math.min(target.models.length, damage / W) }
}

/** Sum of expectedAttack over explicit (model, weapon[, attacks]) assignments. */
export function sumExpectedAttacks(
  state: GameState,
  assignments: { modelId: ModelId; weaponId: WeaponId; targetUnitId: UnitId; attacks?: number | null }[],
  opts: AttackOptions = {},
): number {
  let total = 0
  for (const a of assignments) total += expectedAttack(state, a.modelId, a.weaponId, a.targetUnitId, opts, a.attacks ?? undefined).damage
  return total
}

/** Rough worth of a unit: Health, Save, Control and best-weapon output (no points data at runtime). */
export function unitValue(state: GameState, unitId: UnitId): number {
  const unit = state.units[unitId]
  if (!unit || unit.location !== 'board') return 0
  const models = unitModels(state, unitId)
  if (models.length === 0) return 0
  let base = 0
  for (const model of models) {
    const stats = modelStats(state, model)
    let weaponPotential = 0
    for (const wid of model.weapons) {
      const w = weaponService.effectiveWeapon(state, model.id, wid)
      weaponPotential += diceExprMean(w.A) * diceExprMean(w.D) * (1 + (7 - w.wound) / 6) * (1 + 0.2 * Math.max(0, w.rend))
    }
    base += stats.W * 2 + (7 - stats.Sv) * 1.5 + stats.OC * 2 + weaponPotential
  }
  let mult = 1
  if (keywordsOf(state, unitId).includes('HERO')) mult *= 1.4
  if (unit.isWarlord) mult *= 1.2
  return base * mult
}

export function bestMeleeWeapon(state: GameState, modelId: ModelId): WeaponId | null {
  const model = state.models[modelId]
  if (!model) return null
  let best: WeaponId | null = null
  let bestScore = -Infinity
  for (const wid of model.weapons) {
    const w = weaponService.effectiveWeapon(state, modelId, wid)
    if (w.kind !== 'melee') continue
    const score = diceExprMean(w.A) * diceExprMean(w.D)
    if (score > bestScore) { bestScore = score; best = wid }
  }
  return best
}

export function bestRangedWeapon(state: GameState, modelId: ModelId): { weaponId: WeaponId; range: number } | null {
  const model = state.models[modelId]
  if (!model) return null
  let best: { weaponId: WeaponId; range: number } | null = null
  let bestScore = -Infinity
  for (const wid of model.weapons) {
    const w = weaponService.effectiveWeapon(state, modelId, wid)
    if (w.kind !== 'ranged') continue
    const score = diceExprMean(w.A) * diceExprMean(w.D)
    if (score > bestScore) { bestScore = score; best = { weaponId: wid, range: w.range } }
  }
  return best
}

// crude per-position threat: enemy units' value discounted by how far a point is from their reach
export interface ThreatSource { x: number; z: number; value: number; reach: number }
export function threatSources(state: GameState, forPlayer: PlayerId): ThreatSource[] {
  const out: ThreatSource[] = []
  const seen = new Set<UnitId>()
  for (const m of boardModelsOf(state, forPlayer === 'A' ? 'B' : 'A')) {
    if (seen.has(m.unitId)) continue
    seen.add(m.unitId)
    const stats = modelStats(state, m)
    const ranged = bestRangedWeapon(state, m.id)
    out.push({ x: m.pos.x, z: m.pos.z, value: unitValue(state, m.unitId), reach: Math.max(ranged ? ranged.range : 0, stats.M + 3.5) })
  }
  return out
}
export function threatFrom(sources: ThreatSource[], pos: { x: number; z: number }): number {
  let total = 0
  for (const s of sources) {
    const dist = Math.hypot(s.x - pos.x, s.z - pos.z)
    const scale = s.reach <= 0 ? 0 : Math.max(0, Math.min(1, (s.reach + 6 - dist) / (s.reach + 6)))
    total += s.value * 0.02 * scale
  }
  return total
}
export function threatAt(state: GameState, forPlayer: PlayerId, pos: { x: number; z: number }): number {
  return threatFrom(threatSources(state, forPlayer), pos)
}

// each living model swings / fires its single best weapon of that kind at the target unit
export function unitMeleeDamage(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId, opts: AttackOptions = {}): number {
  let total = 0
  for (const m of unitModels(state, attackerUnitId)) {
    const wid = bestMeleeWeapon(state, m.id)
    if (wid) total += expectedAttack(state, m.id, wid, targetUnitId, opts).damage
  }
  return total
}

export function unitRangedDamage(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId, opts: AttackOptions = {}): number {
  let total = 0
  for (const m of unitModels(state, attackerUnitId)) {
    const best = bestRangedWeapon(state, m.id)
    if (best) total += expectedAttack(state, m.id, best.weaponId, targetUnitId, opts).damage
  }
  return total
}

export function bestRangedRangeOfUnit(state: GameState, unitId: UnitId): number | null {
  let best: number | null = null
  for (const m of unitModels(state, unitId)) {
    const r = bestRangedWeapon(state, m.id)
    if (r && (best === null || r.range > best)) best = r.range
  }
  return best
}

export function hasAnyMeleeWeapon(state: GameState, unitId: UnitId): boolean {
  return unitModels(state, unitId).some((m) => m.weapons.some((wid) => state.weapons[wid]?.kind === 'melee'))
}
export function hasAnyRangedWeapon(state: GameState, unitId: UnitId): boolean {
  return unitModels(state, unitId).some((m) => m.weapons.some((wid) => state.weapons[wid]?.kind === 'ranged'))
}
export function hasKeywordUnit(state: GameState, unitId: UnitId, kw: string): boolean { return hasKeyword(state, unitId, kw) }
