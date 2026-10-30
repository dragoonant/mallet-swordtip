// Balance diagnostics: AI-vs-AI games (the sim setups, utility AI both seats), per-game means of damage dealt / taken per
// unit, attacks, charges (declared, rolled, completed, offered moves), moves, abilities, card commands, VP sources and
// objective control at the end of each round. Usage: npx tsx tools/balance-stats.ts [games] [seed] [-v] [--armies a,b]
import { DATA_VERSION, loadBundle } from '../src/data/index'
import { makeSimSetup } from './sim-core'
import { UtilityDecider } from '../src/ai/utility'
import { createGame, legalActions, step, view } from '../src/engine'

const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith('-') && all[i - 1] !== '--armies')
const games = Number(pos[0] ?? 10)
const seedBase = pos[1] ?? '7'
const verbose = process.argv.includes('-v')
const ai = process.argv.indexOf('--armies')
const only = ai >= 0 ? (process.argv[ai + 1] ?? '').split(',').map((x) => x.trim()).filter(Boolean) : undefined
const stats: Record<string, Record<string, number>> = {}
const bump = (k1: string, k2: string, n = 1) => { (stats[k1] ??= {}); stats[k1][k2] = (stats[k1][k2] ?? 0) + n }

async function main() {
  const bundle = await loadBundle()
  const wins: Record<string, number> = {}
  for (let g = 0; g < games; g++) {
    const seed = `sim-${seedBase}-${g}`
    const setup = makeSimSetup(bundle, g, DATA_VERSION, only)
    const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
    let r = createGame(setup, seed, bundle)
    let n = 0
    const fac = (p: string) => setup.players[p as 'A'].faction
    const unitName = (id: string) => { const u = r.state.units[id]; return u ? (u.datasheetId ?? id).split('.').pop()! : id }
    while (r.pending && n < 6000) {
      const legal = legalActions(r.state, r.pending)
      const a = await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legal)
      if (r.pending.kind === 'chooseUnitToActivate' && (r.pending as any).context.phase === 'charge') { for (const id of (r.pending as any).context.eligible) bump('chargeEligibleOffers', unitName(id)); if (a.type === 'pass') bump('chargePass', fac(r.pending.player)) }
      if (a.type === 'declareMove') bump('declMove', `${unitName(a.unitId)}:${a.moveType}`)
      if (r.pending.kind === 'declareMove') bump('declMoveOffered', unitName((r.pending as any).context.unitId))
      if (r.pending.kind === 'chooseUnitToActivate' && (r.pending as any).context.phase === 'movement') { bump('moveActOffers', fac(r.pending.player)); if (a.type === 'pass') bump('movePass', fac(r.pending.player)) }
      if (r.pending.kind === 'chargeMove') { const u = unitName((r.pending as any).context.unitId); bump('chargeMoveOpts', `${u}:${legal.length - 1}`); bump('chargeMoveChoice', `${u}:${a.type}`) }
      const nx = step(r.state, a)
      if (nx.rejection) { console.log('reject', nx.rejection); break }
      for (const e of nx.events as any[]) {
        const f = fac(e.player)
        if (e.type === 'DamageApplied') {
          const src = e.source
          const tgtU = nx.state.units[e.unitId] ?? r.state.units[e.unitId]
          if (src && 'attackerUnitId' in src) bump('dmgBy', unitName(src.attackerUnitId) + (e.mortal ? '(mw)' : ''), e.amount)
          else if (src && 'abilityId' in src) bump('dmgBy', String(src.abilityId).split('.').pop()!, e.amount)
          bump('dmgTo', unitName(e.unitId), e.amount)
        }
        if (e.type === 'AttackSequenceStarted') bump('attackSeq', `${unitName(e.unitId)}:${e.kind}:r${e.round}`)
        if (e.type === 'ChargeDeclared') bump('chargeDecl', unitName(e.unitId))
        if (e.type === 'ChargeFailed') bump('chargeFail', unitName(e.unitId))
        if (e.type === 'ChargeRolled') { bump('chargeRolled', unitName(e.unitId)); if (e.needed !== null && e.total >= e.needed) bump('chargeRollOk', unitName(e.unitId)); bump('chargeNeededSum', unitName(e.unitId), e.needed ?? 99) }
        if (e.type === 'ChargeMoved') bump('chargeMoved', unitName(e.unitId))
        if (e.type === 'UnitDestroyed') bump('destroyed', unitName(e.unitId) + ':r' + e.round)
        if (e.type === 'VpScored') bump('vp', `${fac(e.player)}:${e.source}`, e.amount)
        if (e.type === 'AbilityTriggered') bump('ability', `${f}:${String(e.abilityId).split('.').pop()}`)
        if (e.type === 'TacticCommandUsed') bump('cmd', `${f}:${e.cardId}`)
        if (e.type === 'TacticScored') bump('tactic', `${f}:${e.cardId}`, e.vp)
        if (e.type === 'UnitReplaced') bump('replaced', unitName(e.unitId))
        if (e.type === 'RoundEnded') for (const o of Object.values(nx.state.objectives) as any[]) if (o.controller) bump('objHeldEndRound', `r${e.round}:${fac(o.controller)}:${o.name ?? o.id}`)
        if (e.type === 'UnitMoved') bump('moved', `${unitName(e.unitId)}:${e.moveType ?? ''}`)
      }
      r = nx; n++
    }
    const s = r.state
    const w = s.result?.winner
    const wf = w && w !== 'draw' ? fac(w) : 'draw'
    wins[wf] = (wins[wf] ?? 0) + 1
    if (verbose) console.log(`g${g} ${fac('A')} v ${fac('B')} -> ${wf} VP ${s.players.A.vp}-${s.players.B.vp} first=${fac(s.firstPlayer ?? 'A')}`)
  }
  console.log(Object.entries(wins).map(([f, n]) => `${f} ${n}`).join(', '))
  for (const [k, v] of Object.entries(stats)) {
    console.log(`== ${k}`)
    for (const [k2, n] of Object.entries(v).sort()) console.log(`  ${k2}: ${+(n / games).toFixed(2)}`)
  }
}
main()
