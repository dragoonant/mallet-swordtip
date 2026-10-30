// AI diagnostics: plays one AI-vs-AI sim game and prints, at the end of every turn, where each unit stands (centre, models
// left, objective it contests, nearest enemy gap), objective control and VP, plus every charge, kill and VP event.
// Usage: npx tsx tools/ai-trace.ts <gameIndex> [seed] [--armies a,b]
import { DATA_VERSION, loadBundle } from '../src/data/index'
import { makeSimSetup } from './sim-core'
import { UtilityDecider } from '../src/ai/utility'
import { DEFAULT_SERVICES, createGame, legalActions, step, unitModels, view, withinObjectiveRange, type GameState } from '../src/engine'

const ai = process.argv.indexOf('--armies')
const only = ai >= 0 ? (process.argv[ai + 1] ?? '').split(',').map((x) => x.trim()).filter(Boolean) : undefined
const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith('-') && all[i - 1] !== '--armies')
const g = Number(pos[0] ?? 0)
const seedBase = pos[1] ?? '11'

const short = (s: GameState, id: string) => { const u = s.units[id]; return `${u?.player ?? '?'}:${(u?.datasheetId ?? id).split('.').pop()}${id.match(/-[a-z0-9]$/) ? id.slice(-2) : ''}` }

function snapshot(s: GameState, label: string): void {
  const ctl = Object.values(s.objectives).filter((o) => !o.removed).map((o) => `${o.name ?? o.id}=${DEFAULT_SERVICES.objectives.controller(s, o.id) ?? '-'}`).join(' ')
  console.log(`-- ${label} VP A ${s.players.A.vp} B ${s.players.B.vp} | ${ctl}`)
  for (const u of Object.values(s.units)) {
    if (u.location !== 'board') continue
    const ms = unitModels(s, u.id)
    const cx = ms.reduce((a, m) => a + m.pos.x, 0) / ms.length, cz = ms.reduce((a, m) => a + m.pos.z, 0) / ms.length
    const obj = Object.values(s.objectives).find((o) => !o.removed && ms.some((m) => withinObjectiveRange(m, o)))
    console.log(`   ${short(s, u.id).padEnd(34)} (${cx.toFixed(1)},${cz.toFixed(1)}) n=${ms.length}/${u.startingStrength}${obj ? ' on ' + (obj.name ?? obj.id) : ''}`)
  }
}

async function main() {
  const bundle = await loadBundle()
  const seed = `sim-${seedBase}-${g}`
  const setup = makeSimSetup(bundle, g, DATA_VERSION, only)
  console.log(`game ${g}: A=${setup.players.A.faction} B=${setup.players.B.faction}`)
  const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
  let r = createGame(setup, seed, bundle)
  let n = 0
  while (r.pending && n < 6000) {
    const legal = legalActions(r.state, r.pending)
    const a = await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legal)
    if (r.pending.kind === 'chooseOption' && (r.pending.context as { topic?: string }).topic?.startsWith('ability')) console.log(`   [${r.state.round}${r.state.activePlayer}] ${r.pending.player} ${(r.pending.context as { topic?: string }).topic} -> ${(a as { optionId?: string }).optionId ?? a.type}`)
    const nx = step(r.state, a)
    if (nx.rejection) { console.log('reject', nx.rejection); break }
    for (const e of nx.events as unknown as Record<string, unknown>[]) {
      const tag = `[${nx.state.round}${nx.state.activePlayer}]`
      if (e.type === 'ChargeRolled') console.log(`   ${tag} charge ${short(nx.state, e.unitId as string)} rolled ${e.total} needed ${e.needed}`)
      if (e.type === 'ChargeMoved') console.log(`   ${tag} charge move ${short(nx.state, e.unitId as string)}`)
      if (e.type === 'UnitDestroyed') console.log(`   ${tag} destroyed ${short(r.state, e.unitId as string)}`)
      if (e.type === 'AbilityTriggered') console.log(`   ${tag} ability ${e.player} ${String(e.abilityId).split('.').pop()}`)
      if (e.type === 'TurnEnded' || e.type === 'RoundEnded') snapshot(nx.state, `${e.type} r${nx.state.round} active ${nx.state.activePlayer}`)
    }
    r = nx; n++
  }
  console.log(`result: ${r.state.result?.winner} VP A ${r.state.players.A.vp} B ${r.state.players.B.vp}`)
}
main()
