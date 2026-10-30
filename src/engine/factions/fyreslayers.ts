// Fyreslayers (Saga Axeband) code hooks: docs/spec/factions/fyreslayers.md (FYR-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/fyreslayers/abilities.json uses. Activated
// abilities use `activate` (hooks.ts ActivatedAbilityHook, run by abilities.ts); passive rules are declarative descriptors, and
// the few that no data scope can name are code. What each hook needs from data:
//
//  fyreslayersAwakenTheRunes (BT-1)   army ability, startOfTurn / your, limit oncePerRound, params.army. params.runes lists the four
//        ur-gold runes ({ id, name, text, standard: Effect[], enhanced: Effect[] }). The mode is the rune (those not yet used this
//        battle, best first for the AI); the hook rolls the D6 itself (the Spirit of Grimnir re-roll included) and grants the
//        standard (+ enhanced on a 6) effects to every friendly unit on the table until the start of the owner's next turn.
//        Used runes live in mission.custom.fyrRunes[player].
//  fyreslayersSpiritOfGrimnir (ENH-3) bare marker (params.reroll 'activation'), read by Awaken through paramsByCode.
//  fyreslayersTooStubborn (ENH-1)     startOfTurn / any, no limit; params.heal. Needs the bearer damaged.
//  fyreslayersHornOfGrimnir (ENH-2)   hero phase / your; params.successOn / returnModels. Bearer must not be in combat.
//  fyreslayersPlantTheIcon (AB-2)     any hero phase, once per battle; grants Ward (params.ward) as an aura (friendly, within
//        params.range, wholly) on the Battlesmith until the end of the turn: the range is read at every ward roll.
//  fyreslayersDutyUnto Death (AB-3)   passive; `adjustFeelNoPain` gives the holder and the general Ward (params.ward) while the general
//        is wholly within params.range of the holder (no data scope can name "the general").
//  fyreslayersThrowingAxes (RA-2)     shooting phase / your, oncePerTurnArmy; params.range / successOn / mortal. One use covers every
//        eligible thrower; v1 picks each thrower's target itself (the visible enemy with the fewest wounds left, ties by id).
//  fyreslayersMagmicTunnels (RA-1)    round 1 start-of-round window, once per battle. The target step picks the first unit, the mode
//        step the optional second one ('none' = just the first); redeploy.ts then asks where each is set up again.
// Icon of Grimnir, Whirlwind of Destruction and Powerful Presence are plain descriptors (Scope.wholly / unitCharged / modifyStat).
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { DiceExpr, Effect } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { EPS } from '../geometry'
import { rollSum } from '../dice'
import { effectService } from '../effects'
import { losService } from '../los'
import { requestRedeploy } from '../redeploy'
import {
  announce, healUnit, inflictMortal, isDamaged, liveModels, onBoard, paramOf, paramsByCode, returnSlainModels, returnableModels, unitGap, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}
const myUnits = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()
const enemyUnits = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player !== player && u.location === 'board').map((u) => u.id).sort()

// ---------- FYR-BT-1 Awaken the Runes ----------
const CODE_AWAKEN = 'fyreslayersAwakenTheRunes'
const CODE_SPIRIT = 'fyreslayersSpiritOfGrimnir'

interface RuneDef { id: string; name: string; text: string; enhancedText?: string; standard: Effect[]; enhanced: Effect[] }

// AI preference when a rune is picked: get into combat first (Zeal), then hit harder, then the defensive rune
const RUNE_ORDER = ['relentless-zeal', 'fury', 'searing-heat', 'fiery-determination']

const awakenAbility = (state: GameState, abilityId?: string) =>
  (abilityId ? state.abilities[abilityId] : undefined) ?? Object.values(state.abilities).find((a) => a.code === CODE_AWAKEN)

const runeDefs = (state: GameState, abilityId?: string): RuneDef[] => (awakenAbility(state, abilityId)?.params?.runes as RuneDef[] | undefined) ?? []

const usedRunes = (state: GameState, player: PlayerId): string[] =>
  ((state.mission.custom.fyrRunes as Partial<Record<PlayerId, string[]>> | undefined)?.[player]) ?? []

const unusedRunes = (state: GameState, player: PlayerId, abilityId?: string): RuneDef[] => {
  const used = usedRunes(state, player)
  const rank = (id: string): number => { const i = RUNE_ORDER.indexOf(id); return i < 0 ? RUNE_ORDER.length : i }
  return runeDefs(state, abilityId).filter((r) => !used.includes(r.id)).sort((a, b) => rank(a.id) - rank(b.id))
}

const awakenActivate: ActivatedAbilityHook & { modesFor?(state: GameState, unitId: UnitId | null, player: PlayerId): { id: string; label: string }[] } = {
  canUse: (state, _unitId, use) => unusedRunes(state, use.player ?? state.activePlayer, use.abilityId).length > 0,
  modesFor: (state, _unitId, player) => unusedRunes(state, player).map((r) => ({ id: r.id, label: `${r.name}: ${r.text}` })),
  resolve(ctx, use) {
    const s = ctx.state
    const rune = unusedRunes(s, use.player, use.abilityId).find((r) => r.id === use.modeId)
    if (!rune) return
    const roll = ctx.roll({ purpose: 'ability', player: use.player, commandRerollable: false })
    let total = rollSum(roll)
    let note = ''
    // Spirit of Grimnir: re-rolling a 1-5 can never make the result worse, so it is always taken
    const general = generalOf(s, use.player)
    if (total < 6 && general && paramsByCode(s, general, CODE_SPIRIT).reroll === 'activation') {
      const again = rollSum(ctx.roll({ purpose: 'ability', player: use.player, commandRerollable: false }))
      note = ` (re-rolled the ${total}, Spirit of Grimnir)`
      total = again
    }
    const enhanced = total >= num(paramOf(s, use.abilityId, 'enhancedOn', 6), 6)
    const effects: Effect[] = [...rune.standard, ...(enhanced ? rune.enhanced : [])]
    for (const id of myUnits(s, use.player)) {
      effectService.grant(ctx, id, effects, { sourceAbilityId: use.abilityId, sourceUnitId: null, scope: { who: 'self' }, duration: 'untilNextTurn' })
    }
    const mine = (s.mission.custom.fyrRunes as Partial<Record<PlayerId, string[]>> | undefined) ?? {}
    s.mission.custom.fyrRunes = { ...mine, [use.player]: [...usedRunes(s, use.player), rune.id] }
    announce(ctx, use, null, `Awaken the Runes: ${rune.name}, rolled ${total}${note}, ${enhanced ? `standard and enhanced effects${rune.enhancedText ? ` (${rune.enhancedText})` : ''}` : 'standard effect'} until your next turn`)
  },
}
const fyreslayersAwakenTheRunes: EngineCodeHook = { name: CODE_AWAKEN, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: awakenActivate }

// ---------- FYR-ENH-3 Spirit of Grimnir ----------
const fyreslayersSpiritOfGrimnir: EngineCodeHook = { name: CODE_SPIRIT, kind: 'ability', hook: 'onStatQuery', run: noop }

// ---------- FYR-ENH-1 Too Stubborn to Die ----------
const stubbornUnit = (state: GameState, unitId: UnitId | null, player: PlayerId | undefined): UnitId | null =>
  unitId ?? state.players[player ?? state.activePlayer]?.warlordUnitId ?? null

const stubbornActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => {
    const id = stubbornUnit(state, unitId, use.player)
    return !!id && !!onBoard(state, id) && isDamaged(state, id)
  },
  resolve(ctx, use) {
    const id = stubbornUnit(ctx.state, use.unitId, use.player)
    if (!id || !onBoard(ctx.state, id)) return
    const dice = paramOf<DiceExpr>(ctx.state, use.abilityId, 'heal', 'D3')
    const amount = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: id, commandRerollable: false }).total
    const healed = healUnit(ctx, id, amount, use.abilityId)
    announce(ctx, use, id, `Too Stubborn to Die: Heal (${amount}), ${healed} damage removed`)
  },
}
const fyreslayersTooStubborn: EngineCodeHook = { name: 'fyreslayersTooStubborn', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: stubbornActivate }

// ---------- FYR-ENH-2 Horn of Grimnir ----------
const hornUnits = (state: GameState, player: PlayerId): UnitId[] => myUnits(state, player).filter((id) => returnableModels(state, id) > 0)

const hornActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const src = onBoard(state, unitId)
    return !!src && !losService.unitInCombat(state, src.id) && hornUnits(state, src.player).length > 0 && (!use.player || use.player === src.player)
  },
  resolve(ctx, use) {
    const src = onBoard(ctx.state, use.unitId)
    if (!src || losService.unitInCombat(ctx.state, src.id)) return
    const need = num(paramOf(ctx.state, use.abilityId, 'successOn', 3), 3)
    const per = num(paramOf(ctx.state, use.abilityId, 'returnModels', 1), 1)
    let back = 0
    for (const id of hornUnits(ctx.state, src.player)) {
      const roll = rollSum(ctx.roll({ purpose: 'ability', player: use.player, unitId: id, commandRerollable: false }))
      if (roll >= need) back += returnSlainModels(ctx, id, per, use.abilityId)
    }
    announce(ctx, use, null, `Horn of Grimnir: ${back} slain model${back === 1 ? '' : 's'} returned`)
  },
}
const fyreslayersHornOfGrimnir: EngineCodeHook = { name: 'fyreslayersHornOfGrimnir', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: hornActivate }

// ---------- FYR-AB-2 Plant the Icon ----------
const plantActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId),
  resolve(ctx, use) {
    const src = onBoard(ctx.state, use.unitId)
    if (!src) return
    const ward = num(paramOf(ctx.state, use.abilityId, 'ward', 5), 5)
    const range = num(paramOf(ctx.state, use.abilityId, 'range', 12), 12)
    // an aura on the Battlesmith: it travels with him and is checked at every ward roll until the end of the turn
    effectService.grant(ctx, src.id, { feelNoPain: ward }, { sourceAbilityId: use.abilityId, sourceUnitId: src.id, scope: { who: 'friendly', within: range, wholly: true }, duration: 'untilEndOfTurn' })
    announce(ctx, use, null, `Plant the Icon: friendly units wholly within ${range}" have Ward (${ward}+) for the rest of the turn`)
  },
}
const fyreslayersPlantTheIcon: EngineCodeHook = { name: 'fyreslayersPlantTheIcon', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: plantActivate }

// ---------- FYR-AB-3 Duty Unto Death ----------
const fyreslayersDutyUntoDeath: EngineCodeHook = {
  name: 'fyreslayersDutyUntoDeath', kind: 'ability', hook: 'onStatQuery', run: noop,
  adjustFeelNoPain(state, entry, modelId, current) {
    const model = state.models[modelId]
    const holder = onBoard(state, entry.holderUnitId)
    if (!model || !holder) return null
    const general = generalOf(state, holder.player)
    if (!general || (model.unitId !== holder.id && model.unitId !== general)) return null
    if (!whollyWithinUnit(state, general, holder.id, num(entry.params.range, 3))) return null
    return { threshold: Math.min(current ?? 7, num(entry.params.ward, 5)), modifier: 0 }
  },
}

// ---------- FYR-RA-2 Fyresteel Throwing Axes ----------
const CODE_AXES = 'fyreslayersThrowingAxes'

const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)

// the visible enemy units within `range` of this thrower, fewest wounds left first (ties by id)
function axeTargets(state: GameState, thrower: UnitId, range: number): UnitId[] {
  const t = onBoard(state, thrower)
  if (!t || losService.unitInCombat(state, thrower)) return []
  const mine = liveModels(state, thrower)
  return enemyUnits(state, t.player)
    .filter((e) => unitGap(state, thrower, e) <= range + EPS && mine.some((m) => losService.unitVisible(state, m.id, e)))
    .sort((a, b) => woundsLeft(state, a) - woundsLeft(state, b) || (a < b ? -1 : 1))
}

const axeRange = (state: GameState, abilityId?: string): number => num(abilityId ? paramOf(state, abilityId, 'range', 10) : 10, 10)

const axesActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => {
    const player = use.player ?? state.activePlayer
    const range = axeRange(state, use.abilityId)
    return myUnits(state, player).some((id) => axeTargets(state, id, range).length > 0)
  },
  resolve(ctx, use) {
    const s = ctx.state
    const range = axeRange(s, use.abilityId)
    const need = num(paramOf(s, use.abilityId, 'successOn', 4), 4)
    const dice = paramOf<DiceExpr>(s, use.abilityId, 'mortal', 'D3')
    // everyone who qualifies when the ability is declared throws, in unit id order (there is no downside to throwing)
    const throwers = myUnits(s, use.player).filter((id) => axeTargets(s, id, range).length > 0)
    let hits = 0
    for (const id of throwers) {
      const target = axeTargets(s, id, range)[0] // the board may have changed since the declaration
      if (!target) continue
      const roll = rollSum(ctx.roll({ purpose: 'ability', player: use.player, unitId: id, targetUnitId: target, commandRerollable: false }))
      if (roll < need) { announce(ctx, use, target, `Fyresteel Throwing Axes: ${s.units[id].name} rolled ${roll}, the axes miss`); continue }
      const dmg = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: id, targetUnitId: target, commandRerollable: false }).total
      hits++
      announce(ctx, use, target, `Fyresteel Throwing Axes: ${s.units[id].name} rolled ${roll}, ${dmg} mortal damage`)
      inflictMortal(ctx, use, target, dmg)
    }
    if (throwers.length > 0 && hits === 0) announce(ctx, use, null, 'Fyresteel Throwing Axes: no axe found its mark')
  },
}
const fyreslayersThrowingAxes: EngineCodeHook = { name: CODE_AXES, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: axesActivate }

// ---------- FYR-RA-1 Magmic Tunnels ----------
const CODE_TUNNELS = 'fyreslayersMagmicTunnels'
const NONE = 'none'

// the ability loop keeps the current selection (ability, unit, target) in a phase mark; the mode step needs the first unit to leave it out
function selectedTarget(state: GameState, abilityId: string): UnitId | null {
  for (const m of state.phaseState.marks) {
    if (!m.startsWith('abil:sel:')) continue
    try {
      const sel = JSON.parse(m.slice(m.indexOf('=') + 1)) as { abilityId?: string; target?: UnitId }
      if (sel.abilityId === abilityId) return sel.target ?? null
    } catch { /* not ours */ }
  }
  return null
}

const tunnelAbilityId = (state: GameState, player: PlayerId): string | null => {
  const id = state.players[player]?.regimentAbilityId
  return id && state.abilities[id]?.code === CODE_TUNNELS ? id : null
}

// the cheap Vulkite-style units first, the general last: the AI takes the first mode
const tunnelOrder = (state: GameState, player: PlayerId, ids: UnitId[]): UnitId[] => {
  const general = state.players[player]?.warlordUnitId
  const rank = (id: UnitId): number => (id === general ? 2 : state.datasheets[state.units[id].datasheetId].stats.W > 2 ? 1 : 0)
  return [...ids].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1))
}

const tunnelsActivate: ActivatedAbilityHook & {
  modesFor?(state: GameState, unitId: UnitId | null, player: PlayerId): { id: string; label: string }[]
} = {
  canUse: (state, _unitId, use) => state.round === num(paramOf(state, use.abilityId ?? '', 'round', 1), 1) && myUnits(state, use.player ?? state.activePlayer).length > 0,
  targets: ((state: GameState, _unitId: UnitId | null, player?: PlayerId) => tunnelOrder(state, player ?? state.activePlayer, myUnits(state, player ?? state.activePlayer))) as ActivatedAbilityHook['targets'],
  modesFor(state, _unitId, player) {
    const id = tunnelAbilityId(state, player)
    const first = id ? selectedTarget(state, id) : null
    const others = tunnelOrder(state, player, myUnits(state, player).filter((u) => u !== first))
    return [...others.map((u) => ({ id: u, label: `And also ${state.units[u].name}` })), { id: NONE, label: 'No second unit' }]
  },
  resolve(ctx, use) {
    const s = ctx.state
    const first = use.targetUnitIds[0]
    if (!first || !onBoard(s, first)) return
    const second = use.modeId && use.modeId !== NONE && use.modeId !== first && onBoard(s, use.modeId) ? use.modeId : null
    const ids = second ? [first, second] : [first]
    requestRedeploy(s, { abilityId: use.abilityId, player: use.player, unitIds: ids, minEnemyDistance: num(paramOf(s, use.abilityId, 'minEnemyDistance', 6), 6) })
    announce(ctx, use, first, `Magmic Tunnels: ${ids.map((id) => s.units[id].name).join(' and ')} dive into the tunnels`)
  },
}
const fyreslayersMagmicTunnels: EngineCodeHook = { name: CODE_TUNNELS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: tunnelsActivate }

export const fyreslayersHooks: Record<string, EngineCodeHook> = {
  fyreslayersAwakenTheRunes, fyreslayersSpiritOfGrimnir, fyreslayersTooStubborn, fyreslayersHornOfGrimnir,
  fyreslayersPlantTheIcon, fyreslayersDutyUntoDeath, fyreslayersThrowingAxes, fyreslayersMagmicTunnels,
}

