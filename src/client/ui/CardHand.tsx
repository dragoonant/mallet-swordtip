// Spearhead cards on screen (11-spearhead §3/§9/§10): the viewer's battle tactic hand as a fan of cards in the
// bottom-left corner with the round's twist above it, and a card viewer (tap / click a card) that shows every card at a
// readable size with the buttons the pending decision allows for it (use a command, score, discard). On a phone the fan
// is replaced by a small "Cards" pill on the left edge that opens the same viewer.
//
// The hand shown is the human's against the bot; in hotseat it is the hand of whoever is being asked (else the active
// player). The opponent's hand is never shown, only its size.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Action, GameState, PendingDecision, PlayerId } from '@/engine'
import { tacticMet } from '@/engine/cards'
import { useGameStore } from '../store/game'
import { useCaughtUp, useDisplayState } from '../presentation/presentedStore'
import { FLAG_LABEL, PICKER_LABEL, SIDE_COLOUR, anyCardName, tacticCard, twistCard, viewerSeat } from './cardInfo'
import { Tooltip } from './Tooltip'
import { buttonBase, buttonPrimary, colors, fontStack } from './theme'
import { useFormFactor } from './formFactor'

const GOLD = '#c9a44c'
const STYLE = `
@keyframes mallet-card-glow { 0%, 100% { box-shadow: 0 0 0 1px ${GOLD}, 0 0 10px 2px rgba(245,217,90,0.45); } 50% { box-shadow: 0 0 0 1px ${GOLD}, 0 0 18px 5px rgba(245,217,90,0.8); } }
@keyframes mallet-card-in { from { transform: translateY(24px) scale(0.92); } to { transform: none; } }
@media (prefers-reduced-motion: reduce) { [data-card-glow] { animation: none !important; } }
`

// ---------- pending-decision buttons for one card ----------
interface CardAction { label: string; action: Action; primary: boolean }

function actionsForCard(pending: PendingDecision | null, cardId: string): CardAction[] {
  if (!pending || pending.kind !== 'chooseOption') return []
  const topic = pending.context.topic
  const out: CardAction[] = []
  if (topic === 'tacticCommand' && !(pending.context.data as { followUp?: unknown }).followUp) {
    for (const o of pending.options) {
      if ((o.hint as { card?: string } | undefined)?.card !== cardId) continue
      const target = o.label.includes(': ') ? o.label.slice(o.label.indexOf(': ') + 2) : o.label
      out.push({ label: `Use: ${target}`, action: o.action, primary: true })
    }
  } else if (topic === 'scoreTactics') {
    const o = pending.options.find((x) => x.id === `score:${cardId}`)
    if (o) out.push({ label: 'Score it (+1 VP)', action: o.action, primary: true })
  } else if (topic === 'discardTactics') {
    const o = pending.options.find((x) => x.id === `discard:${cardId}`)
    if (o) out.push({ label: 'Discard', action: o.action, primary: false })
  } else if (topic === 'bottomTactic') {
    // after an extra draw: the card goes back under the deck, unseen
    const o = pending.options.find((x) => x.id === `bottom:${cardId}`)
    if (o) out.push({ label: 'Put on the bottom of the deck', action: o.action, primary: false })
  }
  return out
}

// ---------- card faces ----------
const faceBase: CSSProperties = {
  boxSizing: 'border-box',
  borderRadius: 10,
  border: `2px solid ${GOLD}`,
  background: 'linear-gradient(165deg, #2c2618 0%, #1b1822 55%, #131219 100%)',
  color: colors.text,
  fontFamily: fontStack,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 8px 22px rgba(0,0,0,0.55)',
  userSelect: 'none',
}
const kicker: CSSProperties = { fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: GOLD, fontWeight: 700 }
const vpCoin: CSSProperties = {
  flex: '0 0 auto', width: 30, height: 30, borderRadius: 15, display: 'grid', placeItems: 'center',
  background: 'radial-gradient(circle at 35% 30%, #ffe9a0, #c9a44c 60%, #7d6220)', color: '#1a1408', fontWeight: 800, fontSize: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
}
const badge = (bg: string): CSSProperties => ({ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: bg, color: '#101010', whiteSpace: 'nowrap' })

export function TacticFace({ cardId, size, met, playable, actions, onAct }: {
  cardId: string; size: 'small' | 'large'; met?: boolean; playable?: boolean; actions?: CardAction[]; onAct?: (a: Action) => void
}) {
  const bundle = useGameStore((s) => s.bundle)
  const card = tacticCard(bundle, cardId)
  const name = card?.name ?? anyCardName(bundle, cardId)
  const large = size === 'large'
  const style: CSSProperties = {
    ...faceBase,
    width: large ? 'min(250px, 76vw)' : 112,
    height: large ? 'auto' : 160,
    minHeight: large ? 'min(340px, calc(100dvh - 120px))' : undefined,
    maxHeight: large ? 'calc(100dvh - 110px)' : undefined,
    overflowY: large ? 'auto' : 'hidden',
    padding: large ? '12px 14px' : '8px 8px 7px',
    gap: large ? 8 : 4,
    flex: '0 0 auto',
    animation: playable ? 'mallet-card-glow 1.6s ease-in-out infinite' : undefined,
  }
  return (
    <div style={style} data-card-glow={playable ? '1' : undefined} data-testid={`tactic-card-${cardId}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {large && <div style={kicker}>Battle tactic</div>}
          <div style={{ fontWeight: 800, fontSize: large ? 17 : 12, lineHeight: 1.15, marginTop: large ? 2 : 0 }}>{name}</div>
        </div>
        <div style={large ? vpCoin : { ...vpCoin, width: 22, height: 22, fontSize: 10 }}>+{card?.tactic.vp ?? 1}</div>
      </div>
      {(met || playable) && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {met && <span style={badge('#7fdc8c')}>Done this turn</span>}
          {playable && <span style={badge(colors.accent)}>Playable now</span>}
        </div>
      )}
      <div style={{ fontSize: large ? 13 : 10, lineHeight: 1.35, color: '#e9e3cf', ...(large ? {} : clampLines(3)) }}>{card?.tactic.text ?? ''}</div>
      <div style={{ flex: large ? '0 0 auto' : 1 }} />
      <div style={{ borderTop: `1px solid rgba(201,164,76,0.45)`, paddingTop: large ? 8 : 4 }}>
        <div style={kicker}>Command</div>
        <div style={{ fontWeight: 700, fontSize: large ? 14 : 10.5, marginTop: 1 }}>{card?.command.name ?? ''}</div>
        <div style={{ fontSize: large ? 11.5 : 9, color: colors.muted, fontStyle: 'italic', marginTop: 1, ...(large ? {} : clampLines(1)) }}>{card?.command.timing ?? ''}</div>
        {large && <div style={{ fontSize: 12.5, lineHeight: 1.35, marginTop: 4 }}>{card?.command.text ?? ''}</div>}
      </div>
      {large && actions && actions.length > 0 && onAct && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {actions.map((a, i) => (
            <button key={i} style={{ ...(a.primary ? buttonPrimary : buttonBase), minHeight: 40, whiteSpace: 'normal', fontSize: 13 }} data-testid={`card-action-${cardId}-${i}`} onClick={() => onAct(a.action)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function clampLines(n: number): CSSProperties {
  return { display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
}

export function TwistFace({ cardId, state, size }: { cardId: string; state: GameState; size: 'chip' | 'large' }) {
  const bundle = useGameStore((s) => s.bundle)
  const card = twistCard(bundle, cardId)
  const tone = SIDE_COLOUR[card?.side ?? 'aqshy'] ?? SIDE_COLOUR.aqshy
  const flags = (state.cards?.flags ?? []).filter((f) => f.source === cardId)
  const lines = flags.map((f) => {
    const where = f.objectiveId ? state.objectives[f.objectiveId]?.name ?? f.objectiveId : f.unitId ? state.units[f.unitId]?.name ?? f.unitId : state.players[f.player]?.name ?? f.player
    return `${FLAG_LABEL[f.kind]}: ${where}`
  })
  if (size === 'chip') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: tone, boxShadow: `0 0 8px ${tone}` }} />
        <span style={{ ...kicker, color: tone }}>Twist</span>
        <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{card?.name ?? anyCardName(bundle, cardId)}</span>
      </div>
    )
  }
  return (
    <div style={{ ...faceBase, borderColor: tone, width: 'min(250px, 76vw)', minHeight: 'min(340px, calc(100dvh - 120px))', maxHeight: 'calc(100dvh - 110px)', overflowY: 'auto', padding: '12px 14px', gap: 8, flex: '0 0 auto', background: `linear-gradient(165deg, ${tone}33 0%, rgba(27,24,34,0) 45%), linear-gradient(165deg, #1b1822 0%, #131219 100%)` }} data-testid={`twist-card-${cardId}`}>
      <div style={{ ...kicker, color: tone }}>Twist · round {state.round}</div>
      <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.15 }}>{card?.name ?? anyCardName(bundle, cardId)}</div>
      {card?.flavour && <div style={{ fontSize: 11.5, fontStyle: 'italic', color: colors.muted }}>{card.flavour}</div>}
      <div style={{ fontSize: 13, lineHeight: 1.4 }}>{card?.text ?? ''}</div>
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 11, color: colors.muted }}>{PICKER_LABEL[card?.picker ?? 'none']}</div>
      {lines.length > 0 && (
        <div style={{ borderTop: `1px solid ${tone}66`, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {lines.map((l, i) => <div key={i} style={{ fontSize: 12, fontWeight: 600 }}>{l}</div>)}
        </div>
      )}
    </div>
  )
}

// ---------- the viewer (modal) ----------
const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(4,4,8,0.86)', zIndex: 1500, isolation: 'isolate', transform: 'translateZ(0)', pointerEvents: 'auto', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: fontStack, color: colors.text,
  padding: 'calc(var(--safe-top, 0px) + 12px) 12px calc(var(--safe-bottom, 0px) + 12px)', boxSizing: 'border-box',
}
const row: CSSProperties = {
  display: 'flex', gap: 14, overflowX: 'auto', maxWidth: '100%', padding: '6px 6px 12px', scrollSnapType: 'x mandatory', alignItems: 'stretch',
  WebkitOverflowScrolling: 'touch',
}

function CardViewer({ state, viewer, focus, onClose, pending, onAct }: {
  state: GameState; viewer: PlayerId; focus: string | null; onClose: () => void; pending: PendingDecision | null; onAct: (a: Action) => void
}) {
  const bundle = useGameStore((s) => s.bundle)
  const piles = state.cards!.tactics[viewer]
  const opp: PlayerId = viewer === 'A' ? 'B' : 'A'
  const oppPiles = state.cards!.tactics[opp]
  const ownTurn = state.activePlayer === viewer
  useEffect(() => {
    const el = focus ? document.querySelector(`[data-viewer-card="${focus}"]`) : null
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [focus])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div style={backdrop} data-testid="card-viewer" onClick={onClose}>
      <style>{STYLE}</style>
      <div style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{state.players[viewer].name}: battle tactics</div>
        <div style={{ fontSize: 12, color: colors.muted }}>
          Deck {piles.deck.length} · Scored {piles.scored.length} · Discarded {piles.discard.length} · Opponent holds {oppPiles.hand.length}
          {oppPiles.scored.length > 0 ? ` and has scored ${oppPiles.scored.map((id) => anyCardName(bundle, id)).join(', ')}` : ''}
        </div>
      </div>
      <div style={row} onClick={(e) => e.stopPropagation()}>
        {state.twist.current && (
          <div style={{ scrollSnapAlign: 'center', display: 'flex' }} data-viewer-card={state.twist.current}>
            <TwistFace cardId={state.twist.current} state={state} size="large" />
          </div>
        )}
        {piles.hand.map((id) => {
          const actions = pending && pending.player === viewer ? actionsForCard(pending, id) : []
          return (
            <div key={id} style={{ scrollSnapAlign: 'center', display: 'flex', animation: 'mallet-card-in 220ms ease-out' }} data-viewer-card={id}>
              <TacticFace cardId={id} size="large" met={ownTurn && tacticMet(state, viewer, id)} playable={actions.length > 0} actions={actions} onAct={(a) => { onAct(a); onClose() }} />
            </div>
          )
        })}
        {piles.hand.length === 0 && !state.twist.current && <div style={{ color: colors.muted, fontSize: 13, padding: 20 }}>No cards in hand.</div>}
      </div>
      <button style={{ ...buttonBase, minHeight: 40, minWidth: 120, flex: '0 0 auto' }} data-testid="card-viewer-close" onClick={onClose}>Close</button>
    </div>
  )
}

// ---------- the hand ----------
const fanWrap: CSSProperties = { position: 'absolute', left: 14, bottom: 14, width: 280, height: 196, pointerEvents: 'none', zIndex: 15 }

// below this width the fan would run under the decision prompt: use the pill instead
const FAN_MIN_WIDTH = 1100
function useWindowWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}
const twistChip: CSSProperties = {
  position: 'absolute', left: 0, bottom: 186, padding: '6px 10px', borderRadius: 8, background: colors.bg, border: `1px solid ${colors.border}`,
  boxShadow: '0 4px 14px rgba(0,0,0,0.45)', cursor: 'pointer', pointerEvents: 'auto', color: colors.text, fontFamily: fontStack,
}
const pill: CSSProperties = {
  position: 'absolute', left: 'calc(var(--safe-left, 0px) + 6px)', top: '46%', transform: 'translateY(-50%)', zIndex: 15, pointerEvents: 'auto',
  minWidth: 52, minHeight: 52, padding: '6px 8px', borderRadius: 12, background: colors.bg, border: `1px solid ${GOLD}`, color: colors.text,
  fontFamily: fontStack, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, boxShadow: '0 4px 14px rgba(0,0,0,0.5)', cursor: 'pointer',
}

export function CardHand() {
  const state = useDisplayState()
  const pending = useGameStore((s) => s.pending)
  const pendingSeq = useGameStore((s) => s.pendingSeq)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const bundle = useGameStore((s) => s.bundle)
  const caughtUp = useCaughtUp(pendingSeq)
  const { compact: phone } = useFormFactor()
  const width = useWindowWidth()
  const compact = phone || width < FAN_MIN_WIDTH
  const [focus, setFocus] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<number | null>(null)

  const live = caughtUp && pending && pending.player !== botSeat ? pending : null
  const viewer = state ? viewerSeat(state, pending?.player ?? null, botSeat) : 'A'
  const hand = state?.cards?.tactics[viewer]?.hand ?? []
  const playable = useMemo(() => new Set(hand.filter((id) => actionsForCard(live && live.player === viewer ? live : null, id).length > 0)), [hand, live, viewer])

  // a decision about the cards opens the viewer on its own once, so the choice is made looking at the cards
  const cardPrompt = !!live && live.player === viewer && live.kind === 'chooseOption' && ['scoreTactics', 'discardTactics', 'bottomTactic'].includes(live.context.topic)
  const autoOpened = useRef(false)
  useEffect(() => {
    if (cardPrompt && compact) { setFocus(null); setOpen(true); autoOpened.current = true }
    else if (!cardPrompt && autoOpened.current) { autoOpened.current = false; setOpen(false) } // the choice was made elsewhere: do not leave the viewer covering the next prompt
  }, [cardPrompt, compact, live?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!state || !state.cards || state.phase === 'setup' || state.phase === 'ended') return null
  if (hand.length === 0 && !state.twist.current && state.cards.tactics[viewer].scored.length === 0) return null
  const ownTurn = state.activePlayer === viewer
  const openAt = (id: string | null) => { setFocus(id); setOpen(true) }
  const act = (a: Action) => dispatch(a)

  // portalled to <body>: the board's floating labels must never draw over the cards
  const viewerEl = open && typeof document !== 'undefined'
    ? createPortal(<CardViewer state={state} viewer={viewer} focus={focus} onClose={() => setOpen(false)} pending={live} onAct={act} />, document.body)
    : null

  if (compact) {
    return (
      <>
        <style>{STYLE}</style>
        <button style={{ ...pill, animation: playable.size > 0 ? 'mallet-card-glow 1.6s ease-in-out infinite' : undefined }} data-testid="cards-pill" aria-label="Show your cards" onClick={() => openAt(null)}>
          <span style={{ fontSize: 9, letterSpacing: 1.2, color: GOLD, fontWeight: 700 }}>CARDS</span>
          <span style={{ fontSize: 17, fontWeight: 800 }}>{hand.length}</span>
          {state.twist.current && <span style={{ width: 8, height: 8, borderRadius: 4, background: SIDE_COLOUR[twistCard(bundle, state.twist.current)?.side ?? 'aqshy'] }} />}
        </button>
        {viewerEl}
      </>
    )
  }

  const n = hand.length
  const fanned: ReactNode[] = hand.map((id, i) => {
    const mid = (n - 1) / 2
    const raised = hover === i
    const rot = (i - mid) * 6
    const style: CSSProperties = {
      position: 'absolute', left: 8 + i * 76, bottom: raised ? 18 : 4 - Math.abs(i - mid) * 4,
      transform: `rotate(${raised ? 0 : rot}deg) scale(${raised ? 1.12 : 1})`, transformOrigin: 'bottom center',
      transition: 'transform 160ms ease, bottom 160ms ease', zIndex: raised ? 10 : i, cursor: 'pointer', pointerEvents: 'auto',
    }
    return (
      <div key={id} style={style} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => openAt(id)} data-testid={`hand-card-${i}`}>
        <TacticFace cardId={id} size="small" met={ownTurn && tacticMet(state, viewer, id)} playable={playable.has(id)} />
      </div>
    )
  })

  return (
    <>
      <style>{STYLE}</style>
      <div style={fanWrap} data-testid="card-hand">
        {state.twist.current && (
          <Tooltip title={twistCard(bundle, state.twist.current)?.name ?? 'Twist'} body={twistCard(bundle, state.twist.current)?.text ?? ''}>
            <div style={twistChip} data-testid="twist-chip" onClick={() => openAt(state.twist.current)}>
              <TwistFace cardId={state.twist.current} state={state} size="chip" />
            </div>
          </Tooltip>
        )}
        {fanned}
        {n === 0 && (
          <div style={{ ...twistChip, bottom: 4, cursor: 'pointer' }} onClick={() => openAt(null)}>
            <span style={{ fontSize: 12, color: colors.muted }}>No tactics in hand · {state.cards.tactics[viewer].scored.length} scored</span>
          </div>
        )}
      </div>
      {viewerEl}
    </>
  )
}
