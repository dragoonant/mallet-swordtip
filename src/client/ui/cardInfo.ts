// Spearhead card helpers for the UI (twist + battle tactic cards, src/data/cards/*.json). Pure lookups over the data
// bundle and the game state; the engine side lives in src/engine/cards.ts.
import type { CardDeckData, DataBundle, TacticCardData, TwistCardData } from '@/data/types'
import type { CardFlagKind, GameState, PlayerId } from '@/engine'
import { cardName } from '@/engine/cards'

function decks(bundle: DataBundle | null): CardDeckData[] {
  return Object.values(bundle?.cardDecks ?? {})
}

export function tacticCard(bundle: DataBundle | null, id: string): TacticCardData | null {
  for (const d of decks(bundle)) { const c = d.tactics.find((t) => t.id === id); if (c) return c }
  return null
}

export function twistCard(bundle: DataBundle | null, id: string): TwistCardData | null {
  for (const d of decks(bundle)) { const c = d.twists.find((t) => t.id === id); if (c) return c }
  return null
}

/** Display name of any card id (falls back to the engine's own name table). */
export function anyCardName(bundle: DataBundle | null, id: string): string {
  return tacticCard(bundle, id)?.name ?? twistCard(bundle, id)?.name ?? cardName(id)
}

export const isCardId = (id: string): boolean => id.startsWith('card.')

/** Whose hand the screen shows: the human seat against the bot; in hotseat the player being asked (else the active one). */
export function viewerSeat(state: GameState, pendingPlayer: PlayerId | null, botSeat: PlayerId | null): PlayerId {
  if (botSeat) return botSeat === 'A' ? 'B' : 'A'
  return pendingPlayer ?? state.activePlayer
}

/** VP by where it came from: objectives (and anything else), battle tactics, twists. */
export function vpSplit(state: GameState, player: PlayerId): { objectives: number; tactics: number; twists: number } {
  const out = { objectives: 0, tactics: 0, twists: 0 }
  for (const [src, n] of Object.entries(state.players[player].vpBySource)) {
    if (src.startsWith('card.tactic.')) out.tactics += n
    else if (src.startsWith('card.twist.')) out.twists += n
    else out.objectives += n
  }
  return out
}

export const SIDE_COLOUR: Record<string, string> = { aqshy: '#ff7a3c', ghyran: '#3fcf8e' }

export const PICKER_LABEL: Record<string, string> = {
  underdog: 'The underdog chooses',
  underdogElseRollOff: 'The underdog chooses (no underdog: roll off)',
  underdogElseEach: 'The underdog chooses (no underdog: each player)',
  rollOffWinner: 'The roll-off winner chooses',
  none: 'Affects both armies',
}

/** Short words for the effects a twist or command left on the table (state.cards.flags). */
export const FLAG_LABEL: Record<CardFlagKind, string> = {
  ringOfFire: 'Ring of Fire',
  wreathed: 'Wreathed in smoke',
  reclaim: 'Reclaim target',
  lifespring: 'Lifespring',
  frenzy: 'Frenzied',
  spearhead: 'Spearhead',
  bloodmarked: 'Bloodmarked',
  ensnared: 'Ensnared',
  shieldOfThorns: 'Shield of Thorns',
  saveMinus: "Nurgle's Rot",
  noWard: 'Eroding Miasma',
  takeTheLand: 'Take the Land',
  steelDefence: 'Steel Defence',
  fightToTheLast: 'Fight to the Last',
  goToGround: 'Gone to ground',
  inspiring: 'Inspiring Presence',
  rally: 'Rallying',
}
