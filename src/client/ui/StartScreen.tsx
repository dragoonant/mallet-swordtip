// Pre-game setup screen (docs/spec/50-client.md §5, Spearhead edition, 13-port-plan §4.3). Pick your army (Cities of
// Sigmar, Ironjawz, Slaves to Darkness or Fyreslayers; any pairing, mirrors included), its regiment ability and enhancement, a bot or a second seat on this
// device, and Start. The battleplan is fixed (Fire and Jade, Aqshy side, standard terrain), so it is shown, not chosen.
// The engine asks the remaining pre-battle questions (attacker, deployment, first turn) as ordinary prompts.
import { FactionCrest } from './FactionCrest'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { loadBundle } from '../../data'
import type { DataBundle } from '../../data/types'
import { AI_DIFFICULTY_OPTIONS, DEFAULT_AI_DIFFICULTY, DEFAULT_SPEARHEAD_FACTIONS, regimentChoices, resolveFactionId, resolvePatrol, spearheadArmies, useGameStore, type AiDifficulty, type FactionKey, type OpponentKind } from '../store/game'
import { phaseLabel, relativeTime, shouldConfirmReplace, type SaveEnvelope } from '../store/saveGame'
import { randomArmyPaint, usePaintStore } from '../figures/paint'
import { PainterPanel } from './PainterPanel'
import { Tooltip } from './Tooltip'
import { buttonActive, buttonBase, buttonDanger, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

// Own-words one-liners per faction id. A faction with no entry here still appears (name only).
const FACTION_BLURBS: Record<string, string> = {
  cities: 'Frontier soldiers of the human cities: drilled spearmen, hard-riding cavalry and a heavy cannon, led by a cavalry marshal who rallies the charge.',
  ironjawz: 'Iron-clad orruk warbands: huge brutes and armoured boyz who smash through anything in reach, with a pack of heavies that crashes in late from nowhere.',
  slaves: 'Oath-sworn raiders from the wild north: a fearless queen, shrieking savagers and fast riders who swear to win glory by deed, and fight harder when they keep their word.',
  fyreslayers: 'Stout gold-hungry duardin berserkers wreathed in rune-fire: fast on the charge, hard to put down, and able to burrow out of one place and into another.',
}

// Preferred card order on the start screen (anything else follows, in data order).
const FACTION_ORDER = ['cities', 'ironjawz', 'slaves', 'fyreslayers']

// Own-words one-liners for the regiment abilities and enhancements shown on the cards; the full rules text from the data is the
// tooltip. An id without an entry here falls back to its data text.
const OPTION_BLURBS: Record<string, string> = {
  'cities.ability.for-sigmar-charge': 'Cavalry that charged this turn swing first in the fight.',
  'cities.ability.ironweld-discipline': 'In your opponent\'s shooting phase your cannon may fire too, on a 3+.',
  'ironjawz.ability.natural-disaster': 'A charge roll of 8+ (before bonuses) gives that unit +1 Attacks on its melee weapons.',
  'ironjawz.ability.a-proper-ruckus': 'Once per battle, the free 3" move of Mighty Destroyers is offered to every unit at once.',
  'slaves.ability.rage-of-arkhar': "Once a turn, one unit in combat swings harder: +1 Attacks and +1 Rend on its melee weapons (a mount's hooves excepted).",
  'slaves.ability.fearless-invaders': 'Once a turn, a unit in combat can retreat without the mortal damage, and may still charge afterwards.',
  'slaves.enh.bloodthirsty-blade': "Your general's rune-etched axe has Rend 2.",
  'slaves.enh.godshadow-talisman': 'Your general shrugs off damage on a 4+ (Ward).',
  'slaves.enh.champion-of-raids': 'In your charge phase, another unit within 12" of your general may re-roll its charges.',
  'slaves.enh.fell-ritualist': 'While your general lives, each time you draw tactic cards you draw 1 extra, then tuck 1 card under your deck.',
  'fyreslayers.ability.magmic-tunnels': 'Once per battle, at the start of round 1, lift up to 2 units off the board and set them down anywhere, clear of the enemy.',
  'fyreslayers.ability.fyresteel-throwing-axes': 'Once a turn, units not in combat hurl axes at a visible enemy within 10": on a 4+ it takes D3 mortal damage.',
  'fyreslayers.enh.too-stubborn-to-die': 'At the start of any turn, your general heals D3 damage.',
  'fyreslayers.enh.horn-of-grimnir': 'In your hero phase, if your general is not in combat, a unit that has lost models may get one back on a 3+ (rolled per unit).',
  'fyreslayers.enh.spirit-of-grimnir': 'You may re-roll the roll that wakes a rune each turn.',
  'fyreslayers.enh.powerful-presence': 'Your general counts as Control +3 on objectives.',
  'cities.enh.flask-of-lethisian-darkwater': 'Once per battle, your general heals D6 damage.',
  'cities.enh.heirloom-blade': 'Your general\'s longsword hits harder against armour: +1 Rend.',
  'cities.enh.brazier-of-holy-flame': 'At the end of any turn, up to D3 fallen Steelhelms stand up near your general.',
  'cities.enh.glimmering': 'Once a phase, re-roll one hit, wound or save made for your general.',
  'ironjawz.enhancement.amberbone-whetstone': 'Your general\'s melee weapons have Rend 2.',
  'ironjawz.enhancement.trophy-skulls': 'Your general counts as Control 5 on objectives.',
  'ironjawz.enhancement.armour-of-gork': 'Your general shrugs off damage on a 6+ (Ward).',
  'ironjawz.enhancement.mega-bossy': 'After your general charges, nearby units add 1 to their charge rolls.',
}

interface FactionChoice {
  id: string
  label: string
  blurb: string
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

// Title art (public/assets/ui/title-bg.webp, 1024x572) fills the whole screen (cover, anchored a little
// above centre so the logo survives cropping). It shows alone for INTRO_MS — a click or key skips it —
// then a dark scrim and the setup card fade in over it. The card is centred and scrolls inside itself
// with Start Battle pinned at the bottom, so the page never needs scrolling. Portrait screens show the
// whole art at full width over a blurred fill instead, since cover would crop the logo away.
const TITLE_BG = `${import.meta.env.BASE_URL}assets/ui/title-bg.webp`
const INTRO_MS = 3000
const layoutCss = `
.ss-overlay { position: fixed; inset: 0; overflow: hidden; font-family: ${fontStack};
  color: ${colors.text}; background: #08080c; display: flex; align-items: center; justify-content: center;
  box-sizing: border-box; padding: var(--safe-top, 0px) var(--safe-right, 0px) var(--safe-bottom, 0px) var(--safe-left, 0px); }
.ss-overlay::before { content: ''; position: fixed; inset: -40px; pointer-events: none;
  background: url(${TITLE_BG}) center / cover no-repeat; filter: blur(18px) brightness(0.45); }
.ss-overlay::after { content: ''; position: fixed; inset: 0; pointer-events: none;
  background: url(${TITLE_BG}) center 30% / cover no-repeat; }
.ss-scrim { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: rgba(4, 4, 8, 0.72);
  opacity: 0; transition: opacity 900ms ease; }
.ss-card { position: relative; z-index: 2; width: 1180px; max-width: calc(100% - 32px); box-sizing: border-box;
  max-height: calc(100vh - 48px); max-height: calc(100dvh - 48px - var(--safe-top, 0px) - var(--safe-bottom, 0px)); opacity: 0; visibility: hidden; transform: translateY(14px);
  transition: opacity 900ms ease, transform 900ms ease, visibility 0s linear 900ms; }
.ss-ready .ss-scrim { opacity: 1; }
.ss-ready .ss-card { opacity: 1; visibility: visible; transform: none; transition: opacity 900ms ease, transform 900ms ease; }
.ss-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 26px; overflow-y: auto;
  min-height: 0; flex: 1 1 auto; padding-right: 4px; }
.ss-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
@media (max-width: 1100px) { .ss-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 700px) { .ss-grid { grid-template-columns: 1fr; } }
@media (max-width: 700px) { .ss-card { max-width: calc(100% - 16px); } }
@media (max-height: 460px) {
  .ss-card { max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px - var(--safe-top, 0px) - var(--safe-bottom, 0px)); }
}
@media (max-aspect-ratio: 1/1) {
  .ss-overlay::after { background-size: 100vw auto; background-position: center 30%; }
}
/* Phones (html[data-ff=compact], set by formFactor.ts): one scrolling column, 44px targets, 16px form text so iOS
   does not zoom on focus. Works in portrait and in landscape down to 667x375. */
html[data-ff="compact"] .ss-card { max-width: calc(100% - 16px); padding: 12px !important; gap: 10px !important;
  max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); }
html[data-ff="compact"] .ss-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; overflow-y: auto; overflow-x: hidden;
  overscroll-behavior: contain; touch-action: pan-y; -webkit-overflow-scrolling: touch; padding-right: 0; }
html[data-ff="compact"] .ss-col { gap: 10px; }
html[data-ff="compact"] .ss-card button { min-height: 44px; white-space: normal; text-align: center; touch-action: manipulation; }
html[data-ff="compact"] .ss-card select,
html[data-ff="compact"] .ss-card input[type="text"] { min-height: 44px; font-size: 16px; box-sizing: border-box; }
html[data-ff="compact"] .ss-card input[type="checkbox"] { width: 24px; height: 24px; flex: none; margin: 0; }
html[data-ff="compact"] .ss-check { display: flex; align-items: center; gap: 10px; min-height: 44px; }
html[data-ff="compact"] .ss-field { display: flex; flex-direction: column; gap: 6px; }
html[data-ff="compact"] .ss-card button[aria-pressed] { font-size: 12px !important; }
html[data-ff="compact"] .ss-secondary { font-size: 13px; }
`

// Automated browsers (Playwright) skip the intro so E2E runs don't wait on it.
const skipIntro = typeof navigator !== 'undefined' && navigator.webdriver

const card: CSSProperties = { ...panel, background: 'rgba(12, 12, 18, 0.86)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }
const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }
const label: CSSProperties = { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, color: colors.muted, marginBottom: -6 }
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
const input: CSSProperties = { ...buttonBase, flex: 1, cursor: 'text' }
const blurb: CSSProperties = { ...mutedText, marginTop: -8 }
// Four armies sit in one row where the column allows (about 330px+), else two by two; never a lone orphan card.
const factionGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 6 }
const factionCard: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 4px', fontSize: 11.5, lineHeight: 1.15, textAlign: 'center', whiteSpace: 'normal', minWidth: 0, overflowWrap: 'anywhere' }
const factionBadge: CSSProperties = { width: 52, height: 52, borderRadius: 6, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.text, fontSize: 30, fontWeight: 700 }
const saveCard: CSSProperties = { flex: 'none', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 6, border: `1px solid ${colors.accent}`, background: 'rgba(255,255,255,0.05)' }
const noticeText: CSSProperties = { flex: 'none', margin: 0, padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.05)', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }
const confirmBackdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const errorText: CSSProperties = { color: colors.danger, fontSize: 13 }
const missionBlurb: CSSProperties = { ...mutedText, marginTop: -6, fontSize: 12 }
const missionList: CSSProperties = { margin: '2px 0 0', paddingLeft: 16, fontSize: 11.5, color: colors.muted }
const optionCard: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, textAlign: 'left' as const }
const pickList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const pickItem: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', textAlign: 'left', whiteSpace: 'normal', padding: '7px 10px', lineHeight: 1.25 }
const pickName: CSSProperties = { fontWeight: 700, fontSize: 13 }
const pickText: CSSProperties = { fontSize: 11.5, color: 'inherit', opacity: 0.78, fontWeight: 400 }

function FactionCard({ id, name, active, onPick, testId }: { id: string; name: string; active: boolean; onPick: () => void; testId?: string }) {
  return (
    <button type="button" data-testid={testId} style={{ ...(active ? buttonActive : buttonBase), ...factionCard }} aria-pressed={active} onClick={onPick}>
      <span style={factionBadge} aria-hidden="true"><FactionCrest faction={id} name={name} size={44} /></span>
      <span>{name}</span>
    </button>
  )
}

interface PickItem { id: string; name: string; text: string }

/** A short list of cards, one picked: the name, an own-words one-liner and the full rules text in the shared tooltip. */
function PickList({ items, selected, onPick, testId, itemTestId }: { items: PickItem[]; selected: string | undefined; onPick: (id: string) => void; testId: string; itemTestId: string }) {
  return (
    <div style={pickList} role="radiogroup" data-testid={testId}>
      {items.map((it) => {
        const on = it.id === selected
        return (
          <Tooltip key={it.id} title={it.name} body={it.text} placement="right">
            <button type="button" role="radio" aria-checked={on} aria-pressed={on} data-testid={`${itemTestId}-${it.id}`} style={{ ...(on ? buttonActive : buttonBase), ...pickItem }} onClick={() => onPick(it.id)}>
              <span style={pickName}>{it.name}</span>
              <span style={pickText}>{OPTION_BLURBS[it.id] ?? it.text}</span>
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}

/** Regiment ability + enhancement pickers for one seat (SPH-2.3 / 2.4): exactly two regiment abilities and four enhancements. */
function ArmyOptions({ bundle, factionKey, regiment, setRegiment, enhancement, setEnhancement, who }: {
  bundle: DataBundle
  factionKey: FactionKey
  regiment: string
  setRegiment: (id: string) => void
  enhancement: string
  setEnhancement: (id: string) => void
  who: string
}) {
  const army = resolvePatrol(bundle, factionKey)
  if (!army) return null
  const regiments = regimentChoices(bundle, army)
  const regimentId = regiments.find((r) => r.id === regiment)?.id ?? regiments.find((r) => r.default)?.id ?? regiments[0]?.id
  const enhancementId = army.enhancements.find((e) => e.id === enhancement)?.id ?? army.enhancements.find((e) => e.default)?.id ?? army.enhancements[0]?.id
  return (
    <>
      <div style={label}>Regiment ability (pick 1 of {regiments.length})</div>
      <PickList items={regiments.map((r) => ({ id: r.id, name: r.name, text: r.text }))} selected={regimentId} onPick={setRegiment} testId={`setup-regiment-${who}`} itemTestId={`setup-regiment-${who}`} />
      <div style={label}>General's enhancement (pick 1 of {army.enhancements.length})</div>
      <PickList
        items={army.enhancements.map((e) => ({ id: e.id, name: bundle.enhancements[e.id]?.name ?? e.id, text: bundle.enhancements[e.id]?.text ?? '' }))}
        selected={enhancementId} onPick={setEnhancement} testId={`setup-enhancement-${who}`} itemTestId={`setup-enhancement-${who}`}
      />
    </>
  )
}

export function StartScreen({ onStarted }: { onStarted: () => void }) {
  const newGame = useGameStore((s) => s.newGame)
  const loading = useGameStore((s) => s.loading)
  const error = useGameStore((s) => s.error)
  const [bundle, setBundle] = useState<DataBundle | null>(null)
  const [faction, setFaction] = useState<FactionKey>(DEFAULT_SPEARHEAD_FACTIONS.player)
  const [opponentFaction, setOpponentFaction] = useState<string>(DEFAULT_SPEARHEAD_FACTIONS.opponent)
  const [opponent, setOpponent] = useState<OpponentKind>('hotseat')
  const [difficulty, setDifficulty] = useState<AiDifficulty>(DEFAULT_AI_DIFFICULTY)
  const [seed, setSeed] = useState<string>(() => randomSeed())
  const [regimentA, setRegimentA] = useState('')
  const [enhancementA, setEnhancementA] = useState('')
  const [regimentB, setRegimentB] = useState('')
  const [enhancementB, setEnhancementB] = useState('')
  const [ready, setReady] = useState(skipIntro)
  // The game saved on this device (autosaved after every action), if it can still be continued.
  const [saved, setSaved] = useState<SaveEnvelope | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [painting, setPainting] = useState(false)
  const saveNotice = useGameStore((s) => s.saveNotice)
  const dismissSaveNotice = useGameStore((s) => s.dismissSaveNotice)
  const inspectSave = useGameStore((s) => s.inspectSave)
  const continueSavedGame = useGameStore((s) => s.continueSavedGame)

  useEffect(() => {
    setSaved(inspectSave())
  }, [inspectSave])

  const resume = async () => {
    const ok = await continueSavedGame()
    if (ok) onStarted()
    else setSaved(null) // bad saves were discarded by the store (the notice explains); a data-load failure keeps it
  }

  useEffect(() => {
    if (ready) return
    const show = () => setReady(true)
    const timer = window.setTimeout(show, INTRO_MS)
    window.addEventListener('keydown', show)
    window.addEventListener('pointerdown', show)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', show)
      window.removeEventListener('pointerdown', show)
    }
  }, [ready])

  useEffect(() => {
    let cancelled = false
    void loadBundle().then((b) => {
      if (!cancelled) setBundle(b)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Every faction that has a Spearhead army, in data order.
  const factions = useMemo<FactionChoice[]>(() => {
    if (!bundle) return []
    const ids = [...new Set(spearheadArmies(bundle).map((p) => p.faction))]
    const rank = (id: string) => { const i = FACTION_ORDER.indexOf(id); return i < 0 ? FACTION_ORDER.length : i }
    return ids.map((id) => ({ id, label: bundle.factions[id]?.name ?? id, blurb: FACTION_BLURBS[id] ?? '' })).sort((a, b) => rank(a.id) - rank(b.id))
  }, [bundle])
  const factionId = resolveFactionId(faction)
  const activeFaction = factions.find((f) => f.id === factionId)
  const opponentActive = factions.find((f) => f.id === opponentFaction)
  const army = bundle ? resolvePatrol(bundle, faction) : undefined
  const mission = bundle ? Object.values(bundle.missions).find((m) => m.format === 'spearhead') : undefined

  // a faction missing from the bundle (data still loading) falls back to the first one that exists
  useEffect(() => {
    if (!factions.length) return
    if (!factions.some((f) => f.id === factionId)) setFaction(factions[0].id)
    if (!factions.some((f) => f.id === opponentFaction)) setOpponentFaction((factions.find((f) => f.id !== factions[0].id) ?? factions[0]).id)
  }, [factions, factionId, opponentFaction])
  useEffect(() => { setRegimentA(''); setEnhancementA('') }, [faction])
  useEffect(() => { setRegimentB(''); setEnhancementB('') }, [opponentFaction])

  // Starting over an existing save asks first (the start button opens the question; "Start new game" runs start()).
  const requestStart = () => {
    if (shouldConfirmReplace()) setConfirmReplace(true)
    else void start()
  }

  const start = async () => {
    setConfirmReplace(false)
    // The opponent gets a fresh random colour scheme every game (game-only; your saved paint is untouched).
    usePaintStore.getState().setSeatPaint('B', randomArmyPaint())
    try {
      await newGame({
        playerFaction: faction,
        opponentFaction,
        patrolId: army?.id,
        opponent,
        seed,
        regimentAbilityId: regimentA || undefined,
        enhancementId: enhancementA || undefined,
        opponentRegimentAbilityId: regimentB || undefined,
        opponentEnhancementId: enhancementB || undefined,
        difficulty: opponent === 'bot' ? difficulty : undefined,
      })
      onStarted()
    } catch {
      // error surfaced via store.error below
    }
  }

  return (
    <div className={ready ? 'ss-overlay ss-ready' : 'ss-overlay'} data-testid="start-screen">
      <style>{layoutCss}</style>
      <h1 style={srOnly}>Mallet Swordtip: Spearhead</h1>
      <div className="ss-scrim" />
      <div className="ss-card" style={card}>
        {saveNotice && (
          <p style={noticeText} data-testid="save-notice" role="status">
            <span>{saveNotice}</span>
            <button style={buttonBase} onClick={dismissSaveNotice}>OK</button>
          </p>
        )}
        {saved && (
          <div style={saveCard} data-testid="continue-card">
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ fontWeight: 600 }} data-testid="continue-factions">{saved.meta.factions.A} vs {saved.meta.factions.B}</div>
              <div style={mutedText} data-testid="continue-detail">
                {saved.meta.phase === 'ended' ? 'Finished' : `Round ${saved.meta.round} · ${phaseLabel(saved.meta.phase)}`} ·{' '}
                {saved.meta.opponent === 'bot'
                  ? `vs bot${saved.meta.difficulty ? ` (${AI_DIFFICULTY_OPTIONS.find((d) => d.key === saved.meta.difficulty)?.label ?? saved.meta.difficulty})` : ''}`
                  : 'hot-seat'}
              </div>
              <div style={mutedText} data-testid="continue-time">Last played {relativeTime(saved.savedAt)}</div>
            </div>
            <button style={{ ...buttonPrimary, padding: '10px 18px' }} data-testid="continue-game" disabled={loading} onClick={() => void resume()}>
              {loading ? 'Loading…' : 'Continue'}
            </button>
          </div>
        )}
        <div className="ss-grid">
        <div className="ss-col">

        <div style={label}>Your Army</div>
        <div style={factionGrid} data-testid="setup-patrol-A">
          {factions.map((f) => (
            <FactionCard key={f.id} id={f.id} testId={`setup-army-A-${f.id}`} name={f.label} active={f.id === factionId} onPick={() => setFaction(f.id)} />
          ))}
        </div>
        {activeFaction?.blurb && <p style={blurb}>{activeFaction.blurb}</p>}
        {bundle && <ArmyOptions bundle={bundle} factionKey={faction} regiment={regimentA} setRegiment={setRegimentA} enhancement={enhancementA} setEnhancement={setEnhancementA} who="A" />}

        </div>
        <div className="ss-col">
        <div style={label}>Battleplan</div>
        <div style={{ ...optionCard, fontSize: 13 }} data-testid="setup-mission">
          <strong>{mission?.name ?? 'Fire and Jade'}</strong>
          <div style={mutedText}>Aqshy side · horizontal split · 30" × 22" · {mission?.rounds ?? 4} battle rounds</div>
        </div>
        {mission?.text && <p style={missionBlurb}>{mission.text}</p>}
        <ul style={missionList} data-testid="setup-mission-scoring">
          <li>At the end of your own turn you score 1 VP for holding at least one objective.</li>
          <li>1 more VP for holding two or more objectives.</li>
          <li>1 more VP for holding more objectives than your opponent.</li>
          <li>Objectives are 3" circles; a unit touching the circle contests it, and the higher total Control holds it.</li>
          <li>The winner is whoever has the most VP after round {mission?.rounds ?? 4}.</li>
        </ul>
        <p style={missionBlurb}>The attacker, deployment and who goes first are decided in play, with the roll-off and priority rolls.</p>

        </div>
        <div className="ss-col">
        <div style={label}>Opponent</div>
        <div style={row} data-testid="setup-opponent">
          <button style={opponent === 'bot' ? buttonActive : buttonBase} onClick={() => setOpponent('bot')}>
            Bot
          </button>
          <button style={opponent === 'hotseat' ? buttonActive : buttonBase} onClick={() => setOpponent('hotseat')}>
            Hotseat (pass the device)
          </button>
        </div>

        <div style={label}>Opponent's Army</div>
        <div style={factionGrid} data-testid="setup-opponent-faction">
          {factions.map((f) => (
            <FactionCard key={f.id} id={f.id} testId={`setup-army-B-${f.id}`} name={f.label} active={f.id === opponentFaction} onPick={() => setOpponentFaction(f.id)} />
          ))}
        </div>
        {opponentActive?.blurb && <p style={blurb}>{opponentActive.blurb}</p>}
        {bundle && <ArmyOptions bundle={bundle} factionKey={opponentFaction} regiment={regimentB} setRegiment={setRegimentB} enhancement={enhancementB} setEnhancement={setEnhancementB} who="B" />}

        {opponent === 'bot' && (
          <>
            <div style={label}>Bot Strength</div>
            <div style={row} data-testid="setup-difficulty">
              {AI_DIFFICULTY_OPTIONS.map((d) => (
                <button key={d.key} style={d.key === difficulty ? buttonActive : buttonBase} onClick={() => setDifficulty(d.key)}>
                  {d.label}
                </button>
              ))}
            </div>
            <p style={blurb}>{AI_DIFFICULTY_OPTIONS.find((d) => d.key === difficulty)?.blurb}</p>
          </>
        )}

        <div style={label}>Seed</div>
        <div style={row}>
          <input style={input} data-testid="setup-seed" value={seed} onChange={(e) => setSeed(e.target.value)} />
          <button style={buttonBase} onClick={() => setSeed(randomSeed())}>
            Reroll
          </button>
        </div>

        </div>
        </div>

        {error && <p style={errorText}>{error}</p>}

        <div style={{ ...row, flex: 'none', flexWrap: 'nowrap' }}>
          <button style={{ ...buttonBase, padding: '12px 16px' }} data-testid="open-painter" onClick={() => setPainting(true)}>
            Paint army
          </button>
          <button style={{ ...buttonPrimary, flex: 1, padding: '12px 16px', fontSize: 15 }} data-testid="start-game" disabled={loading || !bundle} onClick={requestStart}>
            {loading ? 'Loading…' : 'Start Battle'}
          </button>
        </div>
      </div>
      {confirmReplace && (
        <div style={confirmBackdrop} data-testid="replace-save-confirm" role="alertdialog" aria-modal="true" aria-label="Replace saved game">
          <div style={{ ...card, maxWidth: 420 }}>
            <strong>Start a new game?</strong>
            <p style={{ margin: 0, fontSize: 13 }}>
              You have a game in progress{saved ? ` (${saved.meta.factions.A} vs ${saved.meta.factions.B}, round ${saved.meta.round})` : ''}. Starting a new battle replaces it, and the old one cannot be brought back.
            </p>
            <div style={row}>
              <button style={{ ...buttonPrimary, flex: 1 }} data-testid="replace-save-keep" onClick={() => setConfirmReplace(false)}>Keep my saved game</button>
              <button style={{ ...buttonDanger, flex: 1 }} data-testid="replace-save-confirm-start" onClick={() => void start()}>Start new game</button>
            </div>
          </div>
        </div>
      )}
      {painting && <PainterPanel factions={factions} initialFaction={factionId} onClose={() => setPainting(false)} />}
    </div>
  )
}
