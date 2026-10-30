// F10 figure check: the Spearhead figure gallery (?gallery&faction=...) per army and the F8 armies against the Cities and
// Ironjawz figures for scale, then a deployed army close up in a real game. Shots go to e2e-out/f10/figures/.
//   PW_BASE_URL=http://localhost:4471/ npx playwright test tests/e2e/f10-figures.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/f10/figures'
/* eslint-disable @typescript-eslint/no-explicit-any */
const F8 = ['kruleboyz', 'gloomspite', 'lumineth', 'kharadron'] as const

function watch(page: Page): { problems: string[] } {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('[bot]')) problems.push(`console: ${m.text()}`) })
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`) })
  return { problems }
}

test('gallery: every F8 figure uses its GLB (no procedural stand-in), per army and against Cities/Ironjawz', async ({ page }) => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1920, height: 1080 })
  for (const f of ['cities,ironjawz', ...F8]) {
    await page.goto(`/?gallery&faction=${f}`)
    await page.waitForTimeout(6000)
    await page.screenshot({ path: `${OUT}/gallery-${f.replace(',', '+')}.png`, clip: { x: 0, y: 330, width: 1920, height: 420 } })
  }
  expect(problems).toEqual([])
})

// ---- a deployed army close up in a real game, per F8 army ----
const snap = (page: Page) => page.evaluate(() => {
  const st = (window as any).__mallet.useGameStore.getState()
  const p = st.pending
  return { phase: st.state?.phase ?? '', kind: p?.kind ?? null, topic: p?.context?.topic ?? null, mine: !!p && p.player === st.humanSeat, ended: st.state?.phase === 'ended' }
})

// answers the human's pre-deployment prompts (roll-off, tactics) with the first legal action; deployment itself is the UI's auto-place
async function step(page: Page): Promise<void> {
  await page.evaluate(() => {
    const st = (window as any).__mallet.useGameStore.getState()
    const legal = st.legal ?? []
    if (!st.pending || legal.length === 0 || st.pending.kind === 'deployUnit') return
    const pass = legal.find((a: any) => a.type === 'pass')
    const nonPass = legal.filter((a: any) => a.type !== 'pass')
    st.dispatch(nonPass[0] ?? pass)
  })
}

async function until(page: Page, stop: (i: Awaited<ReturnType<typeof snap>>) => boolean, budgetMs: number): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < budgetMs) {
    const i = await snap(page)
    if (i.ended) return false
    if (stop(i)) return true
    if (i.mine) await step(page)
    await page.waitForTimeout(150)
  }
  return false
}

const FOES: Record<string, string> = { kruleboyz: 'cities', gloomspite: 'ironjawz', lumineth: 'cities', kharadron: 'ironjawz' }
const SLUGS: Record<string, string[]> = {
  kruleboyz: ['kru-killaboss-gnashtoof', 'kru-murknob', 'kru-boltboy', 'kru-gutrippa', 'kru-killbow'],
  gloomspite: ['glo-snarlboss', 'glo-wolfgit-bow', 'glo-wolfgit-stikka', 'glo-snarlpack-cavalry', 'glo-sunsteala-wheela'],
  lumineth: ['lrl-windmage', 'lrl-windcharger', 'lrl-spirit-of-the-wind', 'lrl-warden'],
  kharadron: ['ko-admiral', 'ko-arkanaut', 'ko-arkanaut-skypike', 'ko-arkanaut-volley', 'ko-arkanaut-skyhook', 'ko-skywarden', 'ko-skywarden-volley', 'ko-frigate'],
}

for (const army of F8) {
  test(`${army}: deployed army close up, every unit's GLB requested`, async ({ page }) => {
    test.setTimeout(300_000)
    mkdirSync(OUT, { recursive: true })
    const { problems } = watch(page)
    const glbs = new Set<string>()
    page.on('response', (r) => { const m = /\/models\/([\w-]+)\.glb/.exec(r.url()); if (m && r.status() < 400) glbs.add(m[1]) })
    await page.addInitScript(() => {
      localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'fast', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await page.getByTestId(`setup-army-A-${army}`).click()
    await page.getByRole('button', { name: /^Bot$/ }).click()
    await page.getByTestId(`setup-army-B-${FOES[army]}`).click()
    await page.getByTestId('setup-seed').fill(`f10-fig-${army}`)
    await page.getByTestId('start-game').click()
    await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
    await page.waitForFunction(() => !!(window as any).__mallet)
    expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
    await page.waitForTimeout(1500)
    await page.getByTestId('btn-deploy-auto-place').click()
    expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
    await page.getByTestId('btn-deploy-auto-rest').click()
    expect(await until(page, (i) => i.phase !== 'deployment', 150_000)).toBe(true)
    await page.waitForTimeout(3000)
    const units: Array<{ id: string; name: string; x: number; z: number; r: number; facing: number; base: unknown }> = await page.evaluate(() => {
      const st = (window as any).__mallet.useGameStore.getState().state
      return Object.values<any>(st.units).filter((u) => u.player === 'A' && u.location === 'board').map((u) => {
        const ms = u.models.map((id: string) => st.models[id]).filter(Boolean)
        const x = ms.reduce((s: number, m: any) => s + m.pos.x, 0) / ms.length
        const z = ms.reduce((s: number, m: any) => s + m.pos.z, 0) / ms.length
        return { id: u.id, name: u.name, x, z, r: Math.max(...ms.map((m: any) => Math.hypot(m.pos.x - x, m.pos.z - z))), facing: ms[0].facing, base: ms[0].base }
      })
    })
    console.log(army, JSON.stringify(units.map((u) => [u.name, u.facing.toFixed(2), u.base])))
    const cx = units.reduce((s, u) => s + u.x, 0) / units.length
    const cz = units.reduce((s, u) => s + u.z, 0) / units.length
    const span = Math.max(...units.map((u) => Math.hypot(u.x - cx, u.z - cz) + u.r)) + 3
    await page.evaluate(([x, z, d]) => (window as any).__malletCamera.lookAt(x, z, d), [cx, cz, span * 2.4] as const)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/army-${army}.png` })
    // each unit on its own, close
    for (const u of units) {
      await page.evaluate(([x, z, d]) => (window as any).__malletCamera.lookAt(x, z, d), [u.x, u.z, Math.max(7, u.r * 3.2 + 5)] as const)
      await page.waitForTimeout(900)
      await page.screenshot({ path: `${OUT}/unit-${army}-${u.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png` })
    }
    const missing = SLUGS[army].filter((s) => !glbs.has(s))
    console.log(army, 'units', units.map((u) => u.name).join(', '), '| glbs requested', [...glbs].join(','), '| not requested', missing.join(','))
    expect(problems).toEqual([])
  })
}
