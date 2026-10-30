// F9 ux: phone unit tags step clear of objective labels; ability prompts say what they are (slide headings, enemy or friendly target).
import { describe, expect, it } from 'vitest'
import { resolveStagger, StaggerSolver } from '../../src/client/interaction/labelLayout'
import { chooseOptionInfoFor } from '../../src/client/ui/DecisionPrompt'
import type { GameState } from '../../src/engine/types'

describe('unit tags and objective labels (phone)', () => {
  const label = { id: 'objective:0', x: 100, y: 80, w: 70, h: 16 }
  it('lifts a tag that sits on an objective label clear of it, whichever is lower on screen', () => {
    // tag lower than the label's top, overlapping it
    const lowerTag = resolveStagger([{ id: 'u', x: 90, y: 90, w: 80, h: 14 }], 4, [label])
    expect(lowerTag.get('u')).toBeGreaterThan(0)
    expect(90 - lowerTag.get('u')! + 14).toBeLessThanOrEqual(label.y)
    // tag higher than the label, overlapping its top edge: still ends above it
    const higherTag = resolveStagger([{ id: 'u', x: 90, y: 76, w: 80, h: 14 }], 4, [label])
    expect(76 - higherTag.get('u')! + 14).toBeLessThanOrEqual(label.y)
  })
  it('leaves a tag alone that does not touch any objective label', () => {
    expect(resolveStagger([{ id: 'u', x: 300, y: 90, w: 80, h: 14 }], 4, [label]).get('u')).toBe(0)
    expect(resolveStagger([{ id: 'u', x: 90, y: 200, w: 80, h: 14 }], 4, [label]).get('u')).toBe(0)
  })
  it('the solver re-solves when an objective label moves, and not for sub-pixel jitter', () => {
    const solver = new StaggerSolver()
    const tag = { id: 'u', x: 90, y: 90, w: 80, h: 14 }
    const a = solver.update([tag], [label])
    const b = solver.update([tag], [{ ...label, y: label.y + 0.5 }])
    expect(b).toBe(a)
    const c = solver.update([tag], [{ ...label, x: 600 }])
    expect(c.get('u')).toBe(0)
  })
})

describe('ability prompt wording', () => {
  const state = { abilities: { 'x.ability.slide': { name: 'Careening Destruction' }, 'x.ability.zap': { name: 'Lifted Debris' } }, units: { me: { player: 'A' }, foe1: { player: 'B' }, foe2: { player: 'B' } } } as unknown as GameState
  it('names a list of headings with distances as a slide, not "more than one effect"', () => {
    const info = chooseOptionInfoFor({ topic: 'abilityMode', abilityId: 'x.ability.slide', unitId: 'me', data: {} }, [{ id: 'a', label: 'Toward Dracothion (12.0")' }, { id: 'b', label: 'Slide left (8.0")' }], state, 'A')!
    expect(info.title).toBe('Careening Destruction: pick a heading')
    expect(info.hint).not.toMatch(/more than one effect/)
  })
  it('keeps the generic effect wording when the options are not headings', () => {
    const info = chooseOptionInfoFor({ topic: 'abilityMode', abilityId: 'x.ability.slide', unitId: 'me', data: {} }, [{ id: 'a', label: 'Heal D3' }, { id: 'b', label: 'Add 1 to hit' }], state, 'A')!
    expect(info.title).toBe('Careening Destruction: choose an effect')
  })
  it('says whether a target prompt lists enemy or friendly units', () => {
    const enemy = chooseOptionInfoFor({ topic: 'abilityTarget', abilityId: 'x.ability.zap', unitId: null, data: {} }, [{ id: 'foe1' }, { id: 'foe2' }], state, 'A')!
    expect(enemy.hint).toMatch(/enemy unit/)
    const friendly = chooseOptionInfoFor({ topic: 'abilityTarget', abilityId: 'x.ability.zap', unitId: null, data: {} }, [{ id: 'me' }], state, 'A')!
    expect(friendly.hint).toMatch(/friendly unit/)
    const mixed = chooseOptionInfoFor({ topic: 'abilityTarget', abilityId: 'x.ability.zap', unitId: null, data: {} }, [{ id: 'me' }, { id: 'foe1' }], state, 'A')!
    expect(mixed.hint).toBe('Pick the unit this ability affects.')
  })
})
