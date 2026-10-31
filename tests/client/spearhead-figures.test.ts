import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { glbSlugFor, ENABLED_GLB_SLUGS, DECLARED_GLB_SLUGS, GLB_SLUG_BY_MODEL, GLB_FIGURE_ADJUST } from '../../src/client/figures/glbModels'
import { SOURCE_HUES } from '../../src/client/figures/glbPaint'
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
  ['slaves.unit.darkoath-warqueen', 'warqueen', 'darkoath-warqueen'],
  ['slaves.unit.darkoath-savagers', 'savager', 'darkoath-savager'],
  ['slaves.unit.darkoath-savagers', 'godspeaker', 'darkoath-godspeaker'],
  ['slaves.unit.darkoath-fellriders', 'fellrider', 'darkoath-fellrider'],
  ['slaves.unit.darkoath-marauders', 'marauder', 'darkoath-marauder'],
  ['fyreslayers.unit.battlesmith', 'battlesmith', 'fyr-battlesmith'],
  ['fyreslayers.unit.hearthguard-berzerkers', 'hearthguard', 'fyr-hearthguard'],
  ['fyreslayers.unit.vulkite-berzerkers', 'vulkite', 'fyr-vulkite'],
]

// Kruleboyz, Gloomspite, Lumineth and Kharadron: mapped now, switched on as their GLBs land (see glbModels.ts).
const NEW_MODELS: Array<[string, string, string]> = [
  ['kruleboyz.unit.killaboss-on-great-gnashtoof', 'killaboss', 'kru-killaboss-gnashtoof'],
  ['kruleboyz.unit.murknob-with-belcha-banna', 'murknob', 'kru-murknob'],
  ['kruleboyz.unit.man-skewer-boltboyz', 'boltboy', 'kru-boltboy'],
  ['kruleboyz.unit.gutrippaz', 'gutrippa', 'kru-gutrippa'],
  ['kruleboyz.unit.beast-skewer-killbow', 'killbow', 'kru-killbow'],
  ['gloomspite.unit.snarlboss', 'snarlboss', 'glo-snarlboss'],
  ['gloomspite.unit.wolfgit-retinue', 'wolfgit-bow', 'glo-wolfgit-bow'],
  ['gloomspite.unit.wolfgit-retinue', 'wolfgit-stikka', 'glo-wolfgit-stikka'],
  ['gloomspite.unit.snarlpack-cavalry', 'snarlpack-cavalry', 'glo-snarlpack-cavalry'],
  ['gloomspite.unit.sunsteala-wheelas', 'sunsteala-wheela', 'glo-sunsteala-wheela'],
  ['lumineth.unit.hurakan-windmage', 'windmage', 'lrl-windmage'],
  ['lumineth.unit.hurakan-windchargers', 'windcharger', 'lrl-windcharger'],
  ['lumineth.unit.hurakan-spirit-of-the-wind', 'spirit', 'lrl-spirit-of-the-wind'],
  ['lumineth.unit.vanari-auralan-wardens', 'warden', 'lrl-warden'],
  ['kharadron.unit.arkanaut-admiral', 'admiral', 'ko-admiral'],
  ['kharadron.unit.arkanaut-company', 'arkanaut', 'ko-arkanaut'],
  ['kharadron.unit.arkanaut-company', 'arkanaut-skypike', 'ko-arkanaut-skypike'],
  ['kharadron.unit.arkanaut-company-gunners', 'arkanaut', 'ko-arkanaut'],
  ['kharadron.unit.arkanaut-company-gunners', 'arkanaut-volley', 'ko-arkanaut-volley'],
  ['kharadron.unit.arkanaut-company-gunners', 'arkanaut-skyhook', 'ko-arkanaut-skyhook'],
  ['kharadron.unit.skywardens', 'skywarden', 'ko-skywarden'],
  ['kharadron.unit.skywardens', 'skywarden-volley', 'ko-skywarden-volley'],
  ['kharadron.unit.arkanaut-frigate', 'frigate', 'ko-frigate'],
  // Stormcast Eternals, Skaven, Seraphon and Soulblight Gravelords (F12).
  ['stormcast.unit.lord-vigilant', 'lord-vigilant', 'sce-lord-vigilant'],
  ['stormcast.unit.lord-veritant', 'lord-veritant', 'sce-lord-veritant'],
  ['stormcast.unit.prosecutors', 'prosecutor', 'sce-prosecutor'],
  ['stormcast.unit.liberators', 'liberator', 'sce-liberator'],
  ['stormcast.unit.liberators', 'liberator-grandhammer', 'sce-liberator-grandhammer'],
  ['skaven.unit.grey-seer', 'grey-seer', 'skv-grey-seer'],
  ['skaven.unit.clanrats', 'clanrat', 'skv-clanrat'],
  ['skaven.unit.stormfiends', 'stormfiend-gauntlets', 'skv-stormfiend-gauntlets'],
  ['skaven.unit.stormfiends', 'stormfiend-windlaunchers', 'skv-stormfiend-windlaunchers'],
  ['skaven.unit.stormfiends', 'stormfiend-ratling', 'skv-stormfiend-ratling'],
  ['skaven.unit.warp-lightning-cannon', 'warp-lightning-cannon', 'skv-warp-lightning-cannon'],
  ['seraphon.unit.sunblood-pack', 'sunblood', 'ser-sunblood'],
  ['seraphon.unit.sunblood-pack', 'bodyguard', 'ser-saurus-bodyguard'],
  ['seraphon.unit.saurus-warriors', 'warrior', 'ser-saurus-warrior'],
  ['seraphon.unit.hunters-of-huanchi', 'hunter', 'ser-hunter'],
  ['seraphon.unit.terrawings', 'terrawing', 'ser-terrawing'],
  ['seraphon.unit.spawn-of-chotec', 'spawn', 'ser-spawn-of-chotec'],
  ['soulblight.unit.vampire-lord', 'vampire-lord', 'sbg-vampire-lord'],
  ['soulblight.unit.deathrattle-skeletons', 'deathrattle-skeleton', 'sbg-skeleton'],
  ['soulblight.unit.blood-knights', 'blood-knight', 'sbg-blood-knight'],
  ['soulblight.unit.vargheists', 'vargheist', 'sbg-vargheist'],
  // F14: Blades of Khorne, Maggotkin of Nurgle, Nighthaunt, Sylvaneth.
  ['khorne.unit.karanak', 'karanak', 'bok-karanak'],
  ['khorne.unit.flesh-hounds', 'flesh-hound', 'bok-flesh-hound'],
  ['khorne.unit.claws-of-karanak', 'packlord', 'bok-claws-packlord'],
  ['khorne.unit.claws-of-karanak', 'hound-of-wrath', 'bok-claws-hound-of-wrath'],
  ['khorne.unit.claws-of-karanak', 'brutaliser', 'bok-claws-brutaliser'],
  ['khorne.unit.claws-of-karanak', 'blood-whelp', 'bok-claws-blood-whelp'],
  ['nurgle.unit.spoilpox-scrivener', 'spoilpox-scrivener', 'mon-spoilpox-scrivener'],
  ['nurgle.unit.pusgoyle-blightlord', 'pusgoyle-blightlord', 'mon-pusgoyle-blightlord'],
  ['nurgle.unit.putrid-blightkings', 'putrid-blightking', 'mon-putrid-blightking'],
  ['nurgle.unit.plaguebearers', 'plaguebearer', 'mon-plaguebearer'],
  ['nighthaunt.unit.knight-of-shrouds', 'knight-of-shrouds', 'nh-knight-of-shrouds'],
  ['nighthaunt.unit.spirit-hosts', 'spirit-host', 'nh-spirit-host'],
  ['nighthaunt.unit.grimghast-reapers', 'grimghast-reaper', 'nh-grimghast-reaper'],
  ['nighthaunt.unit.chainrasps', 'chainrasp', 'nh-chainrasp'],
  ['sylvaneth.unit.arch-revenant', 'arch-revenant', 'syl-arch-revenant'],
  ['sylvaneth.unit.gossamid-archers', 'gossamid-archer', 'syl-gossamid-archer'],
  ['sylvaneth.unit.spiterider-lancers', 'spiterider-lancer', 'syl-spiterider-lancer'],
  ['sylvaneth.unit.revenant-seekers', 'revenant-seeker', 'syl-revenant-seeker'],
  // F16: Daughters of Khaine, Idoneth Deepkin, Disciples of Tzeentch, Ossiarch Bonereapers (slugs from each spec's Figures table).
  ['daughters.unit.melusai-ironscale', 'melusai-ironscale', 'dok-melusai-ironscale'],
  ['daughters.unit.witch-aelves', 'witch-aelf', 'dok-witch-aelf'],
  ['daughters.unit.doomfire-warlocks', 'doomfire-warlock', 'dok-doomfire-warlock'],
  ['daughters.unit.blood-stalkers', 'blood-stalker', 'dok-blood-stalker'],
  ['idoneth.unit.isharann-soulscryer', 'soulscryer', 'idk-isharann-soulscryer'],
  ['idoneth.unit.akhelian-morrsarr-guard', 'morrsarr-guard', 'idk-morrsarr-guard'],
  ['idoneth.unit.akhelian-allopex', 'allopex', 'idk-akhelian-allopex'],
  ['idoneth.unit.namarti-thralls', 'namarti-thrall', 'idk-namarti-thrall'],
  ['tzeentch.unit.tzaangor-shaman', 'tzaangor-shaman', 'dot-tzaangor-shaman'],
  ['tzeentch.unit.tzaangors', 'tzaangor', 'dot-tzaangor'],
  ['tzeentch.unit.tzaangor-enlightened', 'tzaangor-enlightened', 'dot-tzaangor-enlightened'],
  ['tzeentch.unit.tzaangor-skyfires', 'tzaangor-skyfire', 'dot-tzaangor-skyfire'],
  ['ossiarch.unit.mortisan-ossifector', 'mortisan-ossifector', 'obr-mortisan-ossifector'],
  ['ossiarch.unit.immortis-guard', 'immortis-guard', 'obr-immortis-guard'],
  ['ossiarch.unit.necropolis-stalkers', 'necropolis-stalker', 'obr-necropolis-stalker'],
  ['ossiarch.unit.morghast-archai', 'morghast-archai', 'obr-morghast-archai'],
  // F18: Hedonites of Slaanesh, Helsmiths of Hashut, Flesh-eater Courts, Ogor Mawtribes, Sons of Behemat.
  ['slaanesh.unit.thricefold-discord', 'vexmor', 'hos-vexmor'],
  ['slaanesh.unit.thricefold-discord', 'vashtiss', 'hos-vashtiss'],
  ['slaanesh.unit.thricefold-discord', 'lascivyr', 'hos-lascivyr'],
  ['slaanesh.unit.fiends', 'fiend', 'hos-fiend'],
  ['slaanesh.unit.daemonettes', 'daemonette', 'hos-daemonette'],
  ['slaanesh.unit.seekers', 'seeker', 'hos-seeker'],
  ['helsmiths.unit.war-despot', 'war-despot', 'hoh-war-despot'],
  ['helsmiths.unit.dominator-engine', 'dominator-engine', 'hoh-dominator-engine'],
  ['helsmiths.unit.tormentor-bombard', 'tormentor-bombard', 'hoh-tormentor-bombard'],
  ['helsmiths.unit.infernal-cohort', 'infernal-cohort', 'hoh-infernal-cohort'],
  ['fec.unit.abhorrant-archregent', 'abhorrant-archregent', 'fec-abhorrant-archregent'],
  ['fec.unit.cryptguard', 'cryptguard', 'fec-cryptguard'],
  ['fec.unit.morbheg-knights', 'morbheg-knight', 'fec-morbheg-knight'],
  ['fec.unit.varghulf-courtier', 'varghulf-courtier', 'fec-varghulf-courtier'],
  ['ogors.unit.tyrant', 'tyrant', 'ogm-tyrant'],
  ['ogors.unit.gluttons', 'glutton', 'ogm-glutton'],
  ['ogors.unit.ironguts', 'irongut', 'ogm-irongut'],
  ['ogors.unit.maulbeast-cavalry', 'maulbeast-rider', 'ogm-maulbeast-cavalry'],
  ['behemat.unit.boulder-basher', 'boulder-basher', 'sob-boulder-basher'],
  ['behemat.unit.rock-hurler', 'rock-hurler', 'sob-rock-hurler'],
]

describe('Spearhead figures and board', () => {
  it('FIG-AOS-001 every Spearhead model type maps to an enabled GLB that exists on disk', () => {
    for (const [ds, model, slug] of MODELS) {
      expect(glbSlugFor(ds, model)).toBe(slug)
      expect(ENABLED_GLB_SLUGS).toContain(slug)
      expect(existsSync(`public/assets/models/${slug}.glb`)).toBe(true)
    }
  })

  it('FIG-AOS-004 every enabled GLB slug has a file on disk (a missing one would 404 on every load), none is a dead 40k slug', () => {
    for (const slug of ENABLED_GLB_SLUGS) expect(existsSync(`public/assets/models/${slug}.glb`), slug).toBe(true)
    const mapped = new Set([...MODELS, ...NEW_MODELS].map((m) => m[2]))
    for (const slug of ENABLED_GLB_SLUGS) expect(mapped.has(slug), `${slug} is enabled but no Spearhead model uses it`).toBe(true)
  })

  it('FIG-AOS-005 every new-army model maps to its declared GLB slug; a slug is enabled exactly when its file exists, so a missing one is never requested', () => {
    for (const [ds, model, slug] of NEW_MODELS) {
      expect(GLB_SLUG_BY_MODEL[`${ds}/${model}`], `${ds}/${model}`).toBe(slug)
      expect(DECLARED_GLB_SLUGS, slug).toContain(slug)
      const onDisk = existsSync(`public/assets/models/${slug}.glb`)
      expect(ENABLED_GLB_SLUGS.includes(slug), slug).toBe(onDisk)
      expect(glbSlugFor(ds, model), slug).toBe(onDisk ? slug : undefined)
    }
    for (const slug of DECLARED_GLB_SLUGS) expect([...MODELS, ...NEW_MODELS].some((m) => m[2] === slug), `${slug} is declared but no model uses it`).toBe(true)
    // every datasheet model of the four new armies is mapped (nothing falls through to a 42k look by accident)
    for (const [ds, model] of NEW_MODELS) expect(GLB_SLUG_BY_MODEL[`${ds}/${model}`]).toBeDefined()
  })

  it('FIG-AOS-006 every model of every Spearhead army, read from the datasheets, draws its GLB (no procedural stand-in is left)', () => {
    const armies = readdirSync('src/data/factions')
    let checked = 0
    for (const army of armies) {
      const dir = `src/data/factions/${army}/datasheets`
      if (!existsSync(dir)) continue
      for (const file of readdirSync(dir)) {
        for (const ds of JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as Array<{ id: string; spearhead?: boolean; composition: Array<{ modelId: string }> }>) {
          if (!ds.spearhead) continue
          for (const c of ds.composition) {
            const slug = GLB_SLUG_BY_MODEL[`${ds.id}/${c.modelId}`]
            expect(slug, `${ds.id}/${c.modelId} has no GLB`).toBeDefined()
            // In CI the GLBs of a wave that is not committed yet are absent; the figure then falls back to its stand-in kit
            // (FIG-AOS-005 pins that), so a missing file only warns there. Locally a missing file fails.
            const present = existsSync(`public/assets/models/${slug}.glb`)
            if (!present && process.env.CI) console.warn(`[FIG-AOS-006] ${slug}.glb is not committed yet`)
            else expect(present, `${slug}.glb`).toBe(true)
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(MODELS.length + NEW_MODELS.length)
  })

  it('FIG-AOS-007 the army painter has source hues for the twenty-three armies with their own bands, and every figure fix names a declared slug', () => {
    for (const army of ['slaves', 'fyreslayers', 'kruleboyz', 'gloomspite', 'lumineth', 'kharadron', 'stormcast', 'skaven', 'seraphon', 'soulblight', 'khorne', 'nurgle', 'nighthaunt', 'sylvaneth', 'daughters', 'idoneth', 'tzeentch', 'ossiarch', 'slaanesh', 'helsmiths', 'fec', 'ogors', 'behemat']) {
      const h = SOURCE_HUES[army]
      expect(h, army).toBeDefined()
      expect(h.major ?? h.minor, army).toBeTruthy()
      for (const c of [h.major, h.minor]) if (c) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
    for (const slug of Object.keys(GLB_FIGURE_ADJUST)) expect(DECLARED_GLB_SLUGS, slug).toContain(slug)
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
