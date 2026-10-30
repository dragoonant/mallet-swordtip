import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { glbSlugFor, ENABLED_GLB_SLUGS } from '../../src/client/figures/glbModels'
import { aosModelFor } from '../../src/client/board/terrainCatalog'
import { BATTLEFIELDS } from '../../src/client/board/terrainAssets'

const MODELS: Array<[string, string, string]> = [
  ['cities.unit.freeguild-cavalier-marshal', 'cavalier-marshal', 'cavalier-marshal'],
  ['cities.unit.freeguild-steelhelms', 'steelhelm', 'freeguild-steelhelm'],
  ['cities.unit.freeguild-cavaliers', 'cavalier', 'freeguild-cavalier'],
  ['cities.unit.ironweld-great-cannon', 'great-cannon', 'ironweld-great-cannon'],
  ['ironjawz.unit.megaboss', 'megaboss', 'ironjawz-megaboss'],
  ['ironjawz.unit.brute-ragerz', 'brute-rager', 'brute-rager'],
  ['ironjawz.unit.ardboyz', 'ardboy', 'ironjawz-ardboy'],
  ['ironjawz.unit.brutes', 'brute', 'ironjawz-brute'],
]

describe('Spearhead figures and board', () => {
  it('FIG-AOS-001 every Spearhead model type maps to an enabled GLB that exists on disk', () => {
    for (const [ds, model, slug] of MODELS) {
      expect(glbSlugFor(ds, model)).toBe(slug)
      expect(ENABLED_GLB_SLUGS).toContain(slug)
      expect(existsSync(`public/assets/models/${slug}.glb`)).toBe(true)
    }
  })

  it('FIG-AOS-002 the Spearhead terrain pieces use the aos GLBs, 40k ids keep their look', () => {
    expect(aosModelFor({ id: 'tf-a-large', kind: 'ruin' })).toBe('aos/ruined-domicile')
    expect(aosModelFor({ id: 'tf-b-small', kind: 'crate' })).toBe('aos/ravaged-shrine')
    expect(aosModelFor({ id: 'ruin-s1', kind: 'ruin' })).toBeUndefined()
    const manifest = JSON.parse(readFileSync('public/assets/terrain/aos/manifest.json', 'utf8'))
    for (const slug of ['ruined-domicile', 'ravaged-shrine']) {
      expect(manifest[slug]).toBeDefined()
      expect(existsSync(`public/assets/terrain/aos/${slug}.glb`)).toBe(true)
    }
  })

  it('FIG-AOS-003 the battlefield picker only offers the Realm of Fire mats, all baked', () => {
    expect(BATTLEFIELDS.map((b) => b.id)).toEqual(['aqshy', 'basalt', 'ashlands'])
    for (const b of BATTLEFIELDS) for (const f of ['diff', 'nor', 'rough', 'emis']) expect(existsSync(`public/assets/terrain/battlefield/${b.id}/${f}.jpg`)).toBe(true)
  })
})
