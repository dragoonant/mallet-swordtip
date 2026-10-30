// Client polish: the narrator's extra cues (and that they never talk over each other), thin state rings on big bases,
// the card and redeploy prompts' own wording, and no two-army assumption left in the names the screens print.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadBundle } from '../../src/data'
import { endGameVoiceLine, soundsForEvent, type EventSound } from '../../src/client/audio/eventSounds'
import { channelFor, VOICE_IDS } from '../../src/client/audio/manifest'
import { NARR_ALIAS, soundFile } from '../../src/client/audio/aos'
import { RING_GAP, RING_WIDTH } from '../../src/client/figures/BaseDisc'
import { chooseOptionInfoFor, spotOfOption } from '../../src/client/ui/DecisionPrompt'
import { anyCardName, shortSeatName, tacticCard, twistCard } from '../../src/client/ui/cardInfo'
import type { GameEvent } from '../../src/engine/events'

const bundle = await loadBundle()
const base = { seq: 1, round: 1, turn: 'A', phase: 'command', player: 'A' } as const
const ev = (e: Record<string, unknown>): GameEvent => ({ ...base, ...e }) as unknown as GameEvent
const voices = (sounds: EventSound[]) => sounds.map((s) => s.id).filter((id) => channelFor(id) === 'voice')

describe('CLIENT-POLISH narrator cues', () => {
  it('CLIENT-POLISH-001 rounds one to four each get their own battle round line', () => {
    const line = (round: number) => voices(soundsForEvent(ev({ type: 'RoundStarted', round }), 'A'))
    expect(line(1)).toEqual(['narr-battle-round-one'])
    expect(line(2)).toEqual(['narr-battle-round-two'])
    expect(line(3)).toEqual(['narr-battle-round-three'])
    expect(line(4)).toEqual(['narr-battle-round-four'])
    expect(line(5)).toEqual([])
  })

  it('CLIENT-POLISH-002 priority roll, hero phase and twist reveal are voiced; the combat phase is not', () => {
    expect(voices(soundsForEvent(ev({ type: 'PriorityRolled' }), 'A'))).toEqual(['narr-roll-for-priority'])
    expect(voices(soundsForEvent(ev({ type: 'PhaseStarted', phase: 'command' }), 'A'))).toEqual(['narr-command-phase'])
    expect(voices(soundsForEvent(ev({ type: 'PhaseStarted', phase: 'fight' }), 'A'))).toEqual([])
    expect(voices(soundsForEvent(ev({ type: 'TwistDrawn', cardId: 'card.twist.ring-of-fire', drawRound: 1 }), 'A'))).toEqual(['narr-twist-revealed'])
  })

  it('CLIENT-POLISH-003 battle tactic complete is for the listening player only', () => {
    const scored = (player: string, perspective?: 'A' | 'B') => voices(soundsForEvent(ev({ type: 'TacticScored', cardId: 'card.tactic.raid', vp: 1, player }), perspective))
    expect(scored('A', 'A')).toEqual(['narr-battle-tactic-complete'])
    expect(scored('B', 'A')).toEqual([])
    expect(scored('A')).toEqual([])
  })

  it('CLIENT-POLISH-004 end of turn is said only when no voice line follows it', () => {
    const end = ev({ type: 'PhaseEnded', phase: 'fight' })
    const next = (events: GameEvent[]) => voices(soundsForEvent(end, 'A', undefined, events))
    expect(next([])).toEqual(['narr-end-of-turn'])
    expect(next([ev({ type: 'VpScored', amount: 1, total: 1, source: 'x' })])).toEqual(['narr-end-of-turn'])
    expect(next([ev({ type: 'TurnStarted', turn: 'A' })])).toEqual([])
    expect(next([ev({ type: 'RoundEnded' }), ev({ type: 'RoundStarted', round: 2 })])).toEqual([])
    // other phases never end a turn, and a caller that cannot look ahead gets silence rather than a guess
    expect(voices(soundsForEvent(ev({ type: 'PhaseEnded', phase: 'movement' }), 'A', undefined, []))).toEqual([])
    expect(voices(soundsForEvent(end, 'A'))).toEqual([])
  })

  it('CLIENT-POLISH-005 every new narrator id has a file on disk and is preloaded', () => {
    for (const id of ['narr-battle-round-two', 'narr-battle-round-three', 'narr-battle-round-four', 'narr-roll-for-priority', 'narr-end-of-turn', 'narr-battle-tactic-complete', 'narr-twist-revealed'] as const) {
      expect(VOICE_IDS).toContain(id)
      expect(NARR_ALIAS[id]).toBe(`aos-${id}`)
      expect(soundFile(id)).toBe(`aos-${id}`)
    }
    expect(endGameVoiceLine('A', 'A')).toBe('narr-victory')
  })

  it('CLIENT-POLISH-006 the audio manager plays one narrator line at a time', () => {
    const src = readFileSync(new URL('../../src/client/audio/manager.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/voiceQueue/)
    expect(src).toMatch(/this\.voiceEndsAt/)
  })
})

describe('CLIENT-POLISH rings', () => {
  it('CLIENT-POLISH-010 state rings are a fixed hairline in world inches, in their own lanes', () => {
    for (const w of Object.values(RING_WIDTH)) expect(w).toBeLessThanOrEqual(0.1)
    expect(RING_GAP.highlight + RING_WIDTH.highlight).toBeLessThanOrEqual(RING_GAP.select)
    expect(RING_GAP.select + RING_WIDTH.select).toBeLessThanOrEqual(RING_GAP.hover)
    // no scaled RingGeometry left inside the base's own scaled group
    const src = readFileSync(new URL('../../src/client/figures/BaseDisc.tsx', import.meta.url), 'utf8')
    expect(src).not.toMatch(/<ringGeometry/)
  })
})

describe('CLIENT-POLISH prompts', () => {
  it('CLIENT-POLISH-020 extra and bottom tactic prompts have their own titles', () => {
    const extra = chooseOptionInfoFor({ topic: 'extraTactic', abilityId: null, data: { count: 2 } })
    expect(extra?.title).toBe('Draw 2 extra battle tactic cards?')
    expect(chooseOptionInfoFor({ topic: 'extraTactic', abilityId: null, data: { count: 1 } })?.title).toBe('Draw 1 extra battle tactic card?')
    expect(chooseOptionInfoFor({ topic: 'bottomTactic', abilityId: null, data: { hand: [] } })?.title).toBe('Put a battle tactic back')
  })

  it('CLIENT-POLISH-021 the redeploy prompt is titled for the unit and its spots parse to board positions', () => {
    const info = chooseOptionInfoFor({ topic: 'abilityMode', abilityId: 'x', unitId: null, data: { redeploy: true } })
    expect(info?.title).toBe('Set up the unit again')
    expect(chooseOptionInfoFor({ topic: 'abilityMode', abilityId: 'x', data: { window: 'w' } })?.title).toBe('Choose an effect')
    expect(spotOfOption('at:-12:3')).toEqual({ x: -12, z: 3 })
    expect(spotOfOption('at:4.5:-7.25')).toEqual({ x: 4.5, z: -7.25 })
    expect(spotOfOption('pass')).toBeNull()
  })
})

describe('CLIENT-POLISH four armies', () => {
  it('CLIENT-POLISH-030 every twist and tactic card resolves with its words', () => {
    const decks = Object.values(bundle.cardDecks ?? {})
    expect(decks.length).toBeGreaterThan(0)
    for (const d of decks) {
      for (const t of d.tactics) {
        const c = tacticCard(bundle, t.id)
        expect(c?.tactic.text, t.id).toBeTruthy()
        expect(c?.command.text, t.id).toBeTruthy()
        expect(anyCardName(bundle, t.id), t.id).toBe(t.name)
      }
      for (const t of d.twists) expect(twistCard(bundle, t.id)?.text, t.id).toBeTruthy()
    }
  })

  it('CLIENT-POLISH-031 a mirror match keeps two readable names', () => {
    expect(shortSeatName('Slaves to Darkness')).toBe('Slaves')
    expect(shortSeatName('Slaves to Darkness II')).toBe('Slaves II')
    const src = readFileSync(new URL('../../src/client/store/game.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/seatA\.name === seatB\.name/)
  })
})
