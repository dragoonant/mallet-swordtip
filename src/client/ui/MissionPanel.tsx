// In-game mission briefing (M6 gap: the mission dropdown showed a bare id and the game never
// explained the primary rule or either player's secondary once play started). Toggled from Hud.tsx's
// top bar; pure readout of state.mission + the loaded DataBundle's secondaries.
import type { CSSProperties } from 'react'
import { useGameStore } from '../store/game'
import { useDisplayState } from '../presentation/presentedStore'
import { missionRuleLabel, primaryScoringSummary } from './labels'
import { colors, mutedText, panel } from './theme'
import { useFormFactor } from './formFactor'
import { CompactDrawer } from './compactSheets'

const wrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 56,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 380,
  maxHeight: '60vh',
  overflowY: 'auto',
  padding: 16,
  pointerEvents: 'auto',
}
const closeButton: CSSProperties = { position: 'absolute', top: 8, right: 10, background: 'transparent', border: 'none', color: colors.muted, fontSize: 15, cursor: 'pointer' }
const sectionTitle: CSSProperties = { ...mutedText, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 4 }
const list: CSSProperties = { margin: 0, paddingLeft: 18, fontSize: 12.5 }

export function MissionPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useDisplayState()
  const bundle = useGameStore((s) => s.bundle)
  const { compact } = useFormFactor()
  // Compact: shown in the right-edge drawer (compactSheets store decides when); `open` only matters on desktop.
  if (!state || (!compact && !open)) return null

  const mission = state.mission.data
  const primary = primaryScoringSummary(mission)
  const armyLine = (player: 'A' | 'B'): string => {
    const pl = state.players[player]
    const regiment = pl.regimentAbilityId ? state.abilities[pl.regimentAbilityId]?.name ?? bundle?.abilities[pl.regimentAbilityId]?.name : undefined
    const enhancement = bundle?.enhancements[pl.enhancementId]?.name
    return [regiment, enhancement].filter(Boolean).join(' · ')
  }

  const content = (
    <>
      {mission.text && <p style={{ fontSize: 12.5, marginTop: compact ? 0 : 6 }}>{mission.text}</p>}

      <div style={sectionTitle}>Primary scoring</div>
      <ul style={list}>
        {primary.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      {state.mission.rules.length > 0 && (
        <>
          <div style={sectionTitle}>Special rule{state.mission.rules.length > 1 ? 's' : ''}</div>
          <ul style={list}>
            {state.mission.rules.map((r) => (
              <li key={r.id}>{missionRuleLabel(r)}</li>
            ))}
          </ul>
        </>
      )}

      <div style={sectionTitle}>Battle</div>
      <div style={{ fontSize: 12.5 }} data-testid="mission-round">Round {state.round} of {mission.rounds}{state.underdog ? ` · ${state.players[state.underdog].name} is the underdog` : ''}</div>
      {(['A', 'B'] as const).map((player) => (
        <div key={player} style={{ marginTop: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: player === 'A' ? colors.playerA : colors.playerB }}>
            {state.players[player].name} — {state.players[player].vp} VP
          </div>
          {armyLine(player) && <div style={{ fontSize: 12 }}>{armyLine(player)}</div>}
        </div>
      ))}
    </>
  )

  if (compact) {
    return (
      <CompactDrawer id="mission" title={mission.name}>
        <div data-testid="mission-panel">{content}</div>
      </CompactDrawer>
    )
  }

  return (
    <div style={wrap} data-testid="mission-panel">
      <button style={closeButton} aria-label="Close" onClick={onClose}>
        ✕
      </button>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{mission.name}</div>
      {content}
    </div>
  )
}
