// Hero phase (Phase 'command', CORE-3.13). No command points, no battle-shock, no spells yet (P2). The active player
// uses their "Your / Any Hero Phase" abilities first, then the opponent uses "Enemy / Any Hero Phase" ones. The
// abilities service owns the decisions (topics abilityUse / abilityTarget / abilityMode).
import { notImplementedHandle, type PhaseModule } from '../modules'

export const commandModule: PhaseModule = {
  name: 'command',
  enter(ctx) {
    ctx.state.step = 'activeAbilities'
  },
  advance(ctx) {
    const s = ctx.state
    const abilities = ctx.services.abilities
    if (s.step === 'activeAbilities') {
      if (abilities.runWindow(ctx, 'hero', s.activePlayer)) return 'pending'
      s.step = 'opponentAbilities'
    }
    if (s.step === 'opponentAbilities') {
      if (abilities.runWindow(ctx, 'hero', ctx.opponentOf(s.activePlayer))) return 'pending'
    }
    return 'done'
  },
  handle: notImplementedHandle('command'),
}
