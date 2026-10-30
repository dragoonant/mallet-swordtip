// WP6 (13-engine-port-plan §5, PORT-0.3): the client shows Age of Sigmar names for the engine's kept internal ids.
import { describe, expect, it } from 'vitest'
import { MOVE_NAME, PHASE_NAME, STAT_NAME, moveName, phaseLong, phaseName } from '../../src/client/ui/phaseNames'
import { ROLL_PURPOSE_LABEL, moveTypeHelp, primaryScoringSummary } from '../../src/client/ui/labels'
import { abilityLine } from '../../src/client/ui/weaponRules'
import { aosBundle, aosState } from '../fixtures'

describe('PORT-0.3 labels', () => {
  it('phases: command is the Hero phase and fight is the Combat phase', () => {
    expect(phaseName('command')).toBe('Hero')
    expect(phaseName('fight')).toBe('Combat')
    expect(phaseLong('command')).toBe('Hero phase')
    expect(phaseLong('fight')).toBe('Combat phase')
    expect(phaseName('movement')).toBe('Movement')
    expect(Object.values(PHASE_NAME).some((n) => /command|fight/i.test(n))).toBe(false)
  })

  it('move types: advance is Run and fallBack is Retreat', () => {
    expect(moveName('advance')).toBe('Run')
    expect(moveName('fallBack')).toBe('Retreat')
    expect(Object.values(MOVE_NAME).some((n) => /advance|fall back/i.test(n))).toBe(false)
  })

  it('stats: Health, Save, Control and Ward replace Wounds, Armour Save, Objective Control and Feel No Pain', () => {
    expect(STAT_NAME).toMatchObject({ W: 'Health', Sv: 'Save', OC: 'Control', ward: 'Ward' })
    expect(ROLL_PURPOSE_LABEL.fnp).toBe('Ward')
    expect(ROLL_PURPOSE_LABEL.advance).toBe('Run')
    expect(ROLL_PURPOSE_LABEL.retreat).toBe('Retreat')
    expect(ROLL_PURPOSE_LABEL.priority).toMatch(/priority/i)
  })

  it('move help names Run and Retreat and says what they cost', () => {
    const s = aosState()
    const unit = Object.values(s.units).find((u) => u.datasheetId === 'fx.guard')!
    const run = moveTypeHelp(s, unit.id, 'advance')!
    expect(run.title).toBe('Run')
    expect(run.lines.join(' ')).toMatch(/cannot shoot or charge/)
    const retreat = moveTypeHelp(s, unit.id, 'fallBack')!
    expect(retreat.title).toBe('Retreat')
    expect(retreat.lines.join(' ')).toMatch(/mortal damage/)
  })

  it('weapon abilities have own-words Spearhead names', () => {
    expect(abilityLine({ ability: 'COMPANION' }).name).toBe('Companion')
    expect(abilityLine({ ability: 'SHOOT_IN_COMBAT' }).name).toBe('Shoot in Combat')
    expect(abilityLine({ ability: 'CHARGE_DAMAGE' }).name).toMatch(/Charge/)
    expect(abilityLine({ ability: 'ANTI', keyword: '@charged' }).name).toMatch(/Anti-charge/)
  })

  it('the battleplan scoring summary reads as hold-one / hold-two / hold-more', () => {
    const mission = aosBundle.missions['fx.mission']
    const lines = primaryScoringSummary(mission).join(' | ')
    expect(lines).toMatch(/at least one objective/)
    expect(lines).toMatch(/two or more objectives/)
    expect(lines).toMatch(/more objectives than your opponent/)
  })
})
