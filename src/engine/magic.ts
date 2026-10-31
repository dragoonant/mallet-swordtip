// CORE-15 slice (F8, LRL-AB-1 Guide the Gusts): casting and unbinding spells. abilities.ts calls `castingRoll` instead of the
// plain declared roll for a descriptor that has `castingValue` (data: keywords ['SPELL'], castingValue N).
//
//  - Casting roll: 2D6 >= casting value (CORE-15.2). A double 1 is a miscast: the caster suffers D3 mortal damage and can cast
//    no more spells this phase (CORE-15.3). Spells are unlimited only by power level: a Wizard (datasheet `wizard`, else 1 for a
//    WIZARD keyword) may attempt that many casts per phase (CORE-15.1). The attempt counts whether it succeeds or not.
//  - Unbinding (CORE-15.6): each enemy Wizard within 30" of the caster with unbinding power left this phase may roll 2D6; a
//    roll greater than the casting roll unbinds the spell. RULING: the engine makes that attempt automatically for every
//    eligible enemy Wizard, nearest first, until one succeeds (it has no downside), so no decision is raised.
// Bookkeeping lives in phase marks: `magic:cast:<unitId>` per attempt, `magic:unbind:<unitId>` per unbind attempt,
// `magic:miscast:<unitId>` after a miscast.
// F16 (13-engine-port-plan §3.13): `castingLevel` lets a non-Wizard cast (datasheet `castingLevel`, DOK-AB-4 Doomfire); it never
// unbinds. EngineCodeHook.castingRollBonus (DOT-RA-2 Arcane Ritualists) adds to the casting total; the miscast test stays on the dice.
import { rollSum } from './dice'
import { distance } from './geometry'
import type { EngineContext } from './modules'
import { hookService } from './hooks-impl'
import { datasheetOf, hasKeyword, unitModels } from './state'
import type { GameState, PlayerId, UnitId } from './types'

export interface CastResult { cast: boolean; total: number; miscast: boolean; unbound: boolean; unboundBy: UnitId | null }
export interface CastUse { abilityId: string; unitId: UnitId | null; player: PlayerId }

const count = (state: GameState, mark: string): number => state.phaseState.marks.filter((m) => m === mark).length

// power level: datasheet `wizard`, else 1 for a WIZARD keyword, else 0
export function wizardLevel(state: GameState, unitId: UnitId): number {
  const ds = datasheetOf(state, unitId) as { wizard?: number }
  if (typeof ds.wizard === 'number') return ds.wizard
  return hasKeyword(state, unitId, 'WIZARD') ? 1 : 0
}

// F16 (DOK C1): spells per phase this unit may attempt: its Wizard power level, or the datasheet `castingLevel` of a unit that
// casts without being a Wizard (the higher of the two). Unbinding and every Wizard test keep `wizardLevel`.
export function castingLevel(state: GameState, unitId: UnitId): number {
  const ds = datasheetOf(state, unitId) as { castingLevel?: number }
  return Math.max(wizardLevel(state, unitId), typeof ds.castingLevel === 'number' ? ds.castingLevel : 0)
}

// may this unit attempt another spell this phase?
export function canCast(state: GameState, unitId: UnitId): boolean {
  const u = state.units[unitId]
  if (!u || u.location !== 'board') return false
  if (state.phaseState.marks.includes(`magic:miscast:${unitId}`)) return false
  return count(state, `magic:cast:${unitId}`) < castingLevel(state, unitId)
}

// the casting roll of one spell (counts the attempt, applies a miscast, runs the unbind attempts)
export function castingRoll(ctx: EngineContext, use: CastUse, casterUnitId: UnitId, castingValue: number): CastResult {
  const s = ctx.state
  s.phaseState.marks.push(`magic:cast:${casterUnitId}`)
  const roll = ctx.roll({ purpose: 'ability', player: use.player, sides: 6, count: 2, mode: 'sum', unitId: casterUnitId, commandRerollable: false })
  // F16 (TZE C1): casting roll bonuses add to the total used for the casting value and the unbind; a miscast reads the dice
  const dice = rollSum(roll)
  const bonus = hookService.castingRollBonusFor?.(s, casterUnitId) ?? 0
  const total = dice + bonus
  const miscast = roll.dice.length === 2 && roll.dice[0] === 1 && roll.dice[1] === 1
  if (bonus !== 0 && !miscast) {
    ctx.emit({ type: 'AbilityTriggered', abilityId: use.abilityId, sourceUnitId: casterUnitId, targetUnitId: null, summary: `Casting roll: rolled ${dice}${bonus > 0 ? '+' : ''}${bonus} = ${total}`, player: use.player })
  }
  if (miscast) {
    s.phaseState.marks.push(`magic:miscast:${casterUnitId}`)
    const d3 = ctx.roll({ purpose: 'ability', player: use.player, sides: 3, count: 1, mode: 'sum', unitId: casterUnitId, commandRerollable: false })
    ctx.emit({ type: 'AbilityTriggered', abilityId: use.abilityId, sourceUnitId: casterUnitId, targetUnitId: casterUnitId, summary: `Miscast! ${rollSum(d3)} mortal damage to the caster`, player: use.player })
    ctx.services.attack.queueMortalWounds(ctx, casterUnitId, rollSum(d3), 'miscast', false)
    return { cast: false, total, miscast: true, unbound: false, unboundBy: null }
  }
  if (total < castingValue) return { cast: false, total, miscast: false, unbound: false, unboundBy: null }
  const by = unbindWindow(ctx, casterUnitId, total)
  return { cast: by === null, total, miscast: false, unbound: by !== null, unboundBy: by }
}

// enemy Wizards within 30" with unbinding power left, nearest first
export function unbinders(state: GameState, casterUnitId: UnitId): UnitId[] {
  const caster = state.units[casterUnitId]
  if (!caster) return []
  const cm = unitModels(state, casterUnitId)
  const gap = (id: UnitId): number => Math.min(Infinity, ...unitModels(state, id).flatMap((m) => cm.map((c) => distance(m, c))))
  return Object.values(state.units)
    .filter((u) => u.player !== caster.player && u.location === 'board' && wizardLevel(state, u.id) > count(state, `magic:unbind:${u.id}`))
    .map((u) => ({ id: u.id, d: gap(u.id) }))
    .filter((x) => x.d <= 30 + 1e-6)
    .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1))
    .map((x) => x.id)
}

// the unbind attempts against a casting roll of `total`; returns the unbinding unit, or null when the spell stands
export function unbindWindow(ctx: EngineContext, casterUnitId: UnitId, total: number): UnitId | null {
  const s = ctx.state
  for (const id of unbinders(s, casterUnitId)) {
    s.phaseState.marks.push(`magic:unbind:${id}`)
    const owner = s.units[id].player
    const roll = ctx.roll({ purpose: 'ability', player: owner, sides: 6, count: 2, mode: 'sum', unitId: id, commandRerollable: false })
    const r = rollSum(roll)
    const ok = r > total
    ctx.emit({ type: 'AbilityTriggered', abilityId: 'core.unbind', sourceUnitId: id, targetUnitId: casterUnitId, summary: `Unbind: rolled ${r} against ${total}${ok ? ', the spell is unbound' : ', it fails'}`, player: owner })
    if (ok) return id
  }
  return null
}
