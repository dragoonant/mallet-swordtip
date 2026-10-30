// Cities of Sigmar (Castelite Company) code hooks: docs/spec/factions/ (CITIES-*). WP1 stub; WP7 fills it and spreads it
// into the registry in code-hooks.ts. Activated abilities use `activate` (hooks.ts ActivatedAbilityHook, run by abilities.ts).
import type { EngineCodeHook } from '../code-hooks'

export const citiesHooks: Record<string, EngineCodeHook> = {}
