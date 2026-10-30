// Client UX pass: new movement / miss sounds, the formation bar's scope, the faction crests and the dead 40k prompt copy.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { missWhooshFor, soundsForEvent, type SoundLookup } from '../../src/client/audio/eventSounds'
import { usesFormationShape } from '../../src/client/interaction/decisions'
import { FactionCrest } from '../../src/client/ui/FactionCrest'
import { ringColor } from '../../src/client/interaction/UnitRing'
import type { GameEvent } from '../../src/engine/events'

const base = { seq: 1, round: 1, turn: 'A', phase: 'movement', player: 'A' } as const
const ev = (e: Record<string, unknown>): GameEvent => ({ ...base, ...e }) as unknown as GameEvent
const kw: Record<string, string[]> = { horse: ['CAVALRY'], foot: ['INFANTRY'], gun: ['WAR MACHINE'] }
const lookup: SoundLookup = { weapon: () => undefined, factionOfUnit: () => 'cities', keywordsOfUnit: (id) => kw[id] ?? [] }
const path = { m1: [{ x: 0, z: 0 }, { x: 3, z: 0 }] }

describe('client UX', () => {
  it('UX-AUDIO-1 riders gallop, foot soldiers march, war machines stay silent', () => {
    const ids = (unitId: string) => soundsForEvent(ev({ type: 'UnitMoved', unitId, moveType: 'normal', paths: path }), 'A', lookup).map((s) => s.id)
    expect(ids('horse')).toEqual(['aos-horse-gallop'])
    expect(ids('foot')).toEqual(['aos-armoured-march'])
    expect(ids('gun')).toEqual([])
    expect(soundsForEvent(ev({ type: 'UnitMoved', unitId: 'horse', moveType: 'normal', paths: {} }), 'A', lookup)).toEqual([])
  })

  it('UX-AUDIO-2 a batch of hit rolls whooshes once, and only when something missed', () => {
    const hit = ev({ type: 'HitRolled', hit: true })
    const miss = ev({ type: 'HitRolled', hit: false })
    expect(missWhooshFor([hit, hit])).toEqual([])
    expect(missWhooshFor([miss, miss, miss, hit]).map((s) => s.id)).toEqual(['aos-miss-whoosh'])
  })

  it('UX-FORM-1 the formation bar is for moves, not pile in or consolidate', () => {
    const pending = (kind: string) => ({ kind, id: 'd1', player: 'A', context: { unitId: 'u1' }, constraints: {} }) as never
    expect(usesFormationShape(null)).toBe(false)
    expect(usesFormationShape(pending('pileIn'))).toBe(false)
    expect(usesFormationShape(pending('consolidate'))).toBe(false)
  })

  it('UX-CREST-1 each faction draws its own crest, an unknown one gets a shield with its initial', () => {
    const svg = (f: string, name: string) => renderToStaticMarkup(createElement(FactionCrest, { faction: f, name }))
    expect(svg('cities', 'Cities of Sigmar')).toContain('faction-crest-cities')
    expect(svg('ironjawz', 'Ironjawz')).toContain('faction-crest-ironjawz')
    expect(svg('cities', 'x')).not.toEqual(svg('ironjawz', 'x'))
    expect(svg('other', 'Zed')).toContain('>Z<')
  })

  it('UX-RING-1 unit rings use the seat colour, enemy targets lean red', () => {
    expect(ringColor('A', false)).not.toEqual(ringColor('B', false))
    expect(ringColor('A', true)).toEqual(ringColor('B', true))
  })

  it('UX-COPY-1 the decision prompt no longer carries 40k-only hints', () => {
    const src = readFileSync(new URL('../../src/client/ui/DecisionPrompt.tsx', import.meta.url), 'utf8')
    for (const word of ['Waaagh', 'Oath of Moment', 'StratagemOffers', 'Adeptus', 'Battle-shock test', 'Leadership']) expect(src, word).not.toContain(word)
  })
})
