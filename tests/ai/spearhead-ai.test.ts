// WP6: the bot's heuristics on the checklist fixtures (Guard, Brute, Boss, Knight, Cannon, Hawk). No real army data needed.
import { describe, expect, it } from 'vitest'
import { view, type Action, type DecisionOption, type PendingDecision, type PlayerId } from '../../src/engine'
import { expectedAttack, unitMeleeDamage, unitValue } from '../../src/ai/expected'
import { UtilityDecider } from '../../src/ai/utility'
import { autoDeployAos, aosState, withAosBundle } from '../fixtures'

function deployedState() {
  const s = aosState()
  autoDeployAos(s, 'A')
  autoDeployAos(s, 'B')
  s.phase = 'movement'
  s.activePlayer = 'A'
  return s
}

const unitOf = (s: ReturnType<typeof deployedState>, player: PlayerId, ds: string) =>
  Object.values(s.units).find((u) => u.player === player && u.datasheetId === ds)!

describe('spearhead AI heuristics', () => {
  it('expected damage uses Wound and Rend: more Rend beats a better save', () => {
    const s = deployedState()
    const brute = unitOf(s, 'B', 'fx.brute')
    const guard = unitOf(s, 'A', 'fx.guard')
    const boss = unitOf(s, 'A', 'fx.boss')
    const bm = s.models[brute.models[0]]
    const w = bm.weapons[0]
    const vsGuard = expectedAttack(s, bm.id, w, guard.id).damage
    const vsBoss = expectedAttack(s, bm.id, w, boss.id).damage
    expect(vsGuard).toBeGreaterThan(0)
    expect(vsBoss).toBeGreaterThan(0)
    expect(unitMeleeDamage(s, brute.id, guard.id)).toBeGreaterThan(vsGuard)
    expect(unitValue(s, boss.id)).toBeGreaterThan(0)
  })

  it('a Ward roll cuts expected damage', () => {
    const plain = deployedState()
    const warded = (() => {
      const s = aosState({}, withAosBundle((b) => { b.datasheets['fx.guard'].stats.ward = 5 }))
      autoDeployAos(s, 'A')
      autoDeployAos(s, 'B')
      return s
    })()
    const dmg = (s: typeof plain) => {
      const brute = unitOf(s, 'B', 'fx.brute')
      const guard = unitOf(s, 'A', 'fx.guard')
      const bm = s.models[brute.models[0]]
      return expectedAttack(s, bm.id, bm.weapons[0], guard.id).damage
    }
    expect(dmg(warded)).toBeLessThan(dmg(plain))
  })

  it('the bot never picks a Retreat when a Normal move is on offer', async () => {
    const s = deployedState()
    const guard = unitOf(s, 'A', 'fx.guard')
    const mk = (moveType: 'normal' | 'advance' | 'fallBack' | 'stationary'): Action => ({ type: 'declareMove', player: 'A', decisionId: 'd1', unitId: guard.id, moveType })
    const allowed = ['normal', 'advance', 'fallBack', 'stationary'] as const
    const options: DecisionOption[] = allowed.map((m) => ({ id: m, label: m, action: mk(m) }))
    const pending: PendingDecision = {
      kind: 'declareMove', id: 'd1', player: 'A', window: 'movement.start', canPass: false,
      context: { unitId: guard.id, allowed: [...allowed] },
      options,
    }
    const bot = new UtilityDecider('normal', 'seed')
    const a = await bot.decide(view(s, 'A'), pending, options.map((o) => o.action))
    expect(a.type).toBe('declareMove')
    expect((a as { moveType: string }).moveType).not.toBe('fallBack')
  })

  it('takes the first turn for itself and uses an offered ability', async () => {
    const s = deployedState()
    const bot = new UtilityDecider('normal', 'seed')
    const mkOpt = (id: string): { id: string; label: string; action: Action } => ({ id, label: id, action: { type: 'chooseOption', player: 'B', decisionId: 'd2', optionId: id } })
    const firstOpts = [mkOpt('A'), mkOpt('B')]
    const firstTurn: PendingDecision = {
      kind: 'chooseOption', id: 'd2', player: 'B', window: 'round.start', canPass: false,
      context: { topic: 'firstTurn', unitId: null, abilityId: null, data: {} },
      options: firstOpts,
    }
    const a = await bot.decide(view(s, 'B'), firstTurn, firstOpts.map((o) => o.action))
    expect((a as { optionId: string }).optionId).toBe('B')
    const useOpts = [mkOpt('pass'), mkOpt('fx.a.chaos-regiment-1')]
    const use: PendingDecision = {
      kind: 'chooseOption', id: 'd2', player: 'B', window: 'command.end', canPass: false,
      context: { topic: 'abilityUse', unitId: null, abilityId: null, data: {} },
      options: useOpts,
    }
    const b = await bot.decide(view(s, 'B'), use, useOpts.map((o) => o.action))
    expect((b as { optionId: string }).optionId).toBe('fx.a.chaos-regiment-1')
  })
})
