// Ability re-rolls of a unit's own sum rolls outside the attack sequence: the charge roll (onChargeRoll) and the run roll
// (onAdvanceRoll). STD-ENH-3 Champion of Raids grants { reroll: 'all' } gated to onChargeRoll; STD-AB-2 Visions of Glory
// `produce`s { kind: 'roll', reroll: 'oneDie' } at onAdvanceRoll. Generic: any declarative `reroll` effect that applies at the
// hook, or a code hook's produce, is honoured.
//
// The engine re-rolls only a roll that falls short (sum < needed), so a limited re-roll pool is never spent on a roll that
// already works. Hooks see `roll.roll.needed` (the target the unmodified sum has to reach) and `roll.unmodified` (the sum), the
// same shape citiesGlimmering reads for hit / wound / save rolls, and should return null when they would not re-roll.
// Kinds: 'all' / 'fails' re-roll every die, 'oneDie' the lowest die, 'ones' the dice showing 1. One re-roll per roll (R-1.6).
import { rollSum } from './dice'
import type { HookName } from './hooks'
import type { EngineContext } from './modules'
import type { DiceRoll } from './types'

// run rolls have no failure: below this the engine treats a run roll as worth re-rolling
export const RUN_REROLL_BELOW = 4

const RANK: Record<string, number> = { all: 3, fails: 3, oneDie: 2, ones: 1 }

export function applyAbilityRerolls(ctx: EngineContext, hook: Extract<HookName, 'onChargeRoll' | 'onAdvanceRoll'>, data: Record<string, unknown>, roll: DiceRoll, needed: number): DiceRoll {
  const sum = rollSum(roll)
  if (sum >= needed) return roll
  const results = ctx.services.hooks.collect(ctx, hook, {
    ...data,
    roll: { purpose: roll.purpose, roll: { ...roll, needed }, dieIndex: 0, unmodified: sum, rerolled: (roll.rerolled ?? []).length > 0 },
  } as never)
  let best: { kind: string; source: string } | null = null
  for (const r of results) {
    const res = r.result as { kind?: string; reroll?: string }
    if (res.kind !== 'roll' || !res.reroll) continue
    if (!best || (RANK[res.reroll] ?? 0) > (RANK[best.kind] ?? 0)) best = { kind: res.reroll, source: r.source.id }
  }
  if (!best) return roll
  const open = roll.dice.map((_, i) => i).filter((i) => !(roll.rerolled ?? []).includes(i))
  if (open.length === 0) return roll
  let indexes: number[]
  if (best.kind === 'ones') indexes = open.filter((i) => roll.dice[i] === 1)
  else if (best.kind === 'oneDie') indexes = [open.reduce((a, b) => (roll.dice[b] < roll.dice[a] ? b : a))]
  else indexes = open
  if (indexes.length === 0) return roll
  return ctx.reroll(roll, indexes, best.source)
}
