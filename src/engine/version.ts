// semver of the engine; a save with a different major is refused (00-arch §6). 2.0.0 = the AoS Spearhead port (42k saves refused)
export const ENGINE_VERSION = '2.1.0'

export function majorVersion(v: string): number { return Number(v.split('.')[0]) }
