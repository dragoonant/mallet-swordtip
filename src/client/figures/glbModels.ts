// Which model types may render from a pre-made GLB (public/assets/models/<slug>.glb) instead of the
// procedural figure. Key = `<datasheet id>/<datasheet modelId>` (Model.datasheetModelId in the engine
// state, composition[].modelId in the datasheet JSON). Value = slug = GLB file name without ".glb".
//
// TO ENABLE A MODEL: drop <slug>.glb into public/assets/models/ and add the slug to ENABLED_GLB_SLUGS.
// Nothing else changes. Slugs not listed there are never requested (no 404) and keep the procedural figure;
// a listed slug whose file is missing or broken settles as "failed" once (glbLoader.ts) and the procedural
// figure stays. tests/client/spearhead-figures.test.ts checks every enabled slug exists on disk.
export const ENABLED_GLB_SLUGS: readonly string[] = [
  // Cities of Sigmar: Castelite Company.
  'cavalier-marshal',
  'freeguild-steelhelm',
  'freeguild-cavalier',
  'ironweld-great-cannon',
  // Ironjawz: Bigmob.
  'ironjawz-megaboss',
  'brute-rager',
  'ironjawz-ardboy',
  'ironjawz-brute',
  // Slaves to Darkness: Darkoath Raiders.
  'darkoath-warqueen',
  'darkoath-savager',
  'darkoath-godspeaker',
  'darkoath-fellrider',
  'darkoath-marauder',
  // Fyreslayers: Saga Axeband.
  'fyr-battlesmith',
  'fyr-hearthguard',
  'fyr-vulkite',
]

export const GLB_SLUG_BY_MODEL: Readonly<Record<string, string>> = {
  // Cities of Sigmar.
  'cities.unit.freeguild-cavalier-marshal/cavalier-marshal': 'cavalier-marshal',
  'cities.unit.freeguild-steelhelms/steelhelm': 'freeguild-steelhelm',
  'cities.unit.freeguild-cavaliers/cavalier': 'freeguild-cavalier',
  'cities.unit.ironweld-great-cannon/great-cannon': 'ironweld-great-cannon',
  // Ironjawz.
  'ironjawz.unit.megaboss/megaboss': 'ironjawz-megaboss',
  'ironjawz.unit.brute-ragerz/brute-rager': 'brute-rager',
  'ironjawz.unit.ardboyz/ardboy': 'ironjawz-ardboy',
  'ironjawz.unit.brutes/brute': 'ironjawz-brute',
  // Slaves to Darkness. The Savagers' Godspeaker is its own model so a player can see whether Visions of Glory is still live.
  'slaves.unit.darkoath-warqueen/warqueen': 'darkoath-warqueen',
  'slaves.unit.darkoath-savagers/savager': 'darkoath-savager',
  'slaves.unit.darkoath-savagers/godspeaker': 'darkoath-godspeaker',
  'slaves.unit.darkoath-fellriders/fellrider': 'darkoath-fellrider',
  'slaves.unit.darkoath-marauders/marauder': 'darkoath-marauder',
  // Fyreslayers. fyr-vulkite-karl.glb (a unit-leader look) exists but the warscroll has no champion model to attach it to.
  'fyreslayers.unit.battlesmith/battlesmith': 'fyr-battlesmith',
  'fyreslayers.unit.hearthguard-berzerkers/hearthguard': 'fyr-hearthguard',
  'fyreslayers.unit.vulkite-berzerkers/vulkite': 'fyr-vulkite',
}

/** Render-time corrections for GLBs whose baked `figure` node came out of the pipeline at the wrong size or facing.
 *  `scale` multiplies the baked figure (the base node is never scaled with it: GlbBody fits the baked base disc to the
 *  datasheet base instead). `yaw` is in quarter turns about Y, for hulls that were baked lying across their base
 *  (figures face +Z, so a bike/skimmer's long axis must run along Z). Sizes are chosen against the real kits: an
 *  Impulsor/Rhino overhangs its base a little, a bike or juggernaut fills its oval, a Dreadknight stands ~2.7 footsoldiers tall. */
export const GLB_FIGURE_ADJUST: Readonly<Record<string, { scale?: number; yaw?: number }>> = {
  // Spearhead: the Great Cannon came out of the pipeline with its barrel along X (the 120x92mm oval runs along Z).
  'ironweld-great-cannon': { yaw: 1 },
}

/** The enabled GLB slug for a model type, or undefined (use the procedural figure). */
export function glbSlugFor(datasheetId: string, modelId: string | undefined, variantKey?: string): string | undefined {
  if (!modelId) return undefined
  let slug = GLB_SLUG_BY_MODEL[`${datasheetId}/${modelId}`]
  // A model type with two sculpts (the Poxwalkers) alternates by a stable hash of the model instance id.
  const alt = slug ? GLB_ALT_SLUG[slug] : undefined
  if (alt && variantKey && variantHash(variantKey) % 2 === 1) slug = alt
  return slug && ENABLED_GLB_SLUGS.includes(slug) ? slug : undefined
}

/** Slugs with a second sculpt: half of the model instances (by id hash) use the alternate. Empty until one ships. */
const GLB_ALT_SLUG: Readonly<Record<string, string>> = {}

function variantHash(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}
