// Weapon helpers and weapon-ability bookkeeping (10-rules §7, 20-data §4). Owner: W1-D. Pure queries; granted
// abilities (grantWeaponAbility effects) are merged by `effectiveWeapon` via services.hooks onStatQuery.
import type { DiceExpr, WeaponAbilityName } from '../data/types'
import { parseDiceExpr } from './dice'
import { codeHookFor, hookService, sourcesFor } from './hooks-impl'
import type { AttackContext } from './hooks'
import type { GameState, ModelId, RuntimeWeapon, WeaponId } from './types'

export interface WeaponService {
  hasAbility(weapon: RuntimeWeapon, ability: WeaponAbilityName): boolean
  abilityValue(weapon: RuntimeWeapon, ability: WeaponAbilityName): DiceExpr | null
  // the weapon as this model uses it now: stat modifiers (onStatQuery), granted abilities, R-1.9 clamps
  // `attack` (E2): the attack context, so target-aware conditions / target-held scopes resolve (Gilded Spear, Purity of Execution)
  effectiveWeapon(state: GameState, modelId: ModelId, weaponId: WeaponId, attack?: AttackContext): RuntimeWeapon
  // one entry per profile group: [groupId | weaponId, profile weapon ids]
  profileGroups(state: GameState, weaponIds: WeaponId[]): { group: string; weaponIds: WeaponId[] }[]
  // C4: false iff some code-hook source says (weaponAvailable) this weapon cannot be used by the model right now
  isAvailable(state: GameState, modelId: ModelId, weaponId: WeaponId): boolean
}

export const weaponService: WeaponService = {
  hasAbility: (weapon, ability) => weapon.abilities.some((a) => a.ability === ability),
  abilityValue(weapon, ability) {
    const a = weapon.abilities.find((x) => x.ability === ability)
    return a?.value ?? null
  },
  // stat modifiers (onStatQuery: modifyStat/setStat) applied to the weapon's numeric stats (range, Attacks / Damage when they
  // are flat numbers, Hit via BS/WS, Rend via the AP axis: Rend n = AP -n) and grantWeaponAbility effects merged in.
  // CORE-12.4 Companion: a Companion weapon is unaffected by friendly characteristic changes, so only stat modifiers whose
  // effect carries `affectsCompanion` (GLO-AB-1 Great Snarlin' Howl) reach it, and no ability is granted to it (negative
  // modifiers and enemy abilities act on the rolls, not on the profile).
  effectiveWeapon(state, modelId, weaponId, attack) {
    const base = state.weapons[weaponId]
    const model = state.models[modelId]
    if (!base || !model) return base
    const companionOnly = base.abilities.some((a) => a.ability === 'COMPANION')
    const abilities = companionOnly ? base.abilities : hookService.weaponAbilitiesFor ? hookService.weaponAbilitiesFor(state, modelId, base, attack) : base.abilities
    const q = (stat: 'BS' | 'WS' | 'S' | 'AP' | 'range' | 'A' | 'D', v: number) =>
      hookService.statFor ? hookService.statFor(state, { unitId: model.unitId, modelId, weapon: base, stat, attack, ...(companionOnly ? { companionOnly } : {}) }, v) : v
    const skillStat = base.kind === 'ranged' ? 'BS' as const : 'WS' as const
    const skill = base.skill === null ? null : q(skillStat, base.skill)
    const range = q('range', base.range)
    const rend = Math.max(0, -q('AP', -base.rend))
    const parsedA = parseDiceExpr(base.A)
    const A: DiceExpr = parsedA.count === 0 ? q('A', parsedA.flat) : base.A
    const parsedD = parseDiceExpr(base.D)
    // KRU-AB-2 Skewered: a setStat on a dice Damage (D6 -> 6) replaces it. Two probes with very different bases agree only when a
    // set is in force (a plain modifier would shift both), so additive modifiers still leave a dice Damage alone.
    const D: DiceExpr = parsedD.count === 0 ? q('D', parsedD.flat) : ((set) => (set === q('D', 2000) ? set : base.D))(q('D', 1000))
    if (abilities === base.abilities && skill === base.skill && range === base.range && A === base.A && D === base.D && rend === base.rend) return base
    return { ...base, abilities, skill, range, A, D, rend }
  },
  isAvailable(state, modelId, weaponId) {
    for (const entry of sourcesFor(state)) {
      const spec = codeHookFor(entry.code)
      if (!spec?.weaponAvailable || entry.active) continue
      if (spec.weaponAvailable(state, entry, modelId, weaponId) === false) return false
    }
    return true
  },
  profileGroups(state, weaponIds) {
    const groups = new Map<string, WeaponId[]>()
    for (const id of weaponIds) {
      const key = state.weapons[id]?.profileGroup ?? id
      groups.set(key, [...(groups.get(key) ?? []), id])
    }
    return [...groups.entries()].map(([group, ids]) => ({ group, weaponIds: ids }))
  },
}
