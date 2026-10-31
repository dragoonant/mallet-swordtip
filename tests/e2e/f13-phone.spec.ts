// F13 phone prompt check: the deployment prompt and an activation prompt must leave the board (and the player's own zone) visible.
//   PH_LABEL=before|after PW_BASE_URL=http://localhost:4495/mallet-swordtip/ npx playwright test tests/e2e/f13-phone.spec.ts --project=chromium
// Screenshots go to e2e-out/f13-phone/<label>-<device>-<shot>.png; the prompt's height share is logged beside them.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { centroid, project, refreshCam, snap, makeCam } from './helpers'

const OUT = 'e2e-out/f13-phone'
const LABEL = process.env.PH_LABEL ?? 'after'

/* eslint-disable @typescript-eslint/no-explicit-any */
async function step(page: Page, stop: (i: { round: number; phase: string; kind: string | null }) => boolean, budgetMs = 120_000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < budgetMs) {
    const info = await page.evaluate(() => {
      const st = (window as any).__mallet.useGameStore.getState()
      return { round: st.state?.round ?? 0, phase: st.state?.phase ?? '', kind: st.pending?.kind ?? null, ended: st.state?.phase === 'ended' }
    })
    if (info.ended) return false
    if (stop(info)) return true
    await page.evaluate(() => {
      const st = (window as any).__mallet.useGameStore.getState()
      const legal = st.legal ?? []
      if (!st.pending || legal.length === 0) return
      const pass = legal.find((a: any) => a.type === 'pass')
      const nonPass = legal.filter((a: any) => a.type !== 'pass')
      st.dispatch(nonPass[0] ?? pass)
    })
    await page.waitForTimeout(120)
  }
  return false
}

async function run(page: Page, device: string): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  const log: Record<string, unknown> = {}
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'instant', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.waitForTimeout(1800)
  await page.getByTestId('setup-army-A-cities').click()
  await page.getByRole('button', { name: /^Hotseat/ }).click()
  await page.getByTestId('setup-army-B-ironjawz').click()
  await page.getByTestId('setup-seed').fill('cam-1')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
  const grab = async (name: string) => {
    const prompt = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="prompt"]') as HTMLElement | null
      const r = el?.getBoundingClientRect()
      return r ? { top: r.top, height: r.height, share: r.height / window.innerHeight } : null
    })
    log[name] = { prompt, camera: await page.evaluate(() => (window as any).__malletCamera?.get()) }
    await page.screenshot({ path: `${OUT}/${LABEL}-${device}-${name}.png` })
  }

  await step(page, (i) => i.kind === 'deployUnit')
  await page.waitForTimeout(2500)
  await grab('1-deployment-open')

  // pick the first unit to deploy: the prompt folds, the ghost shows in the own zone
  const chip = page.locator('[data-testid="prompt"] button', { hasText: /Freeguild|Cavalier|Steelhelms/ }).first()
  await chip.click()
  await page.waitForTimeout(1800)
  await grab('2-deployment-unit-picked')

  // tap inside the own zone: the formation ghost lands there, and the prompt stays a slim strip
  const sn = await snap(page)
  const zone = (sn.pending?.context as any)?.zone as { x: number; z: number }[] | undefined
  if (zone && zone.length) {
    await refreshCam(page)
    const c = centroid(zone)
    const vp = page.viewportSize()!
    const pt = project({ x: c.x, y: 0, z: c.z }, makeCam(), vp.width, vp.height)
    await page.mouse.click(pt.x, pt.y)
    await page.waitForTimeout(1200)
    await grab('2b-deployment-ghost-in-zone')
  }

  await step(page, (i) => i.round >= 1 && i.phase === 'movement' && i.kind === 'chooseUnitToActivate', 180_000)
  await page.waitForTimeout(2000)
  await grab('3-round1-activation')

  writeFileSync(`${OUT}/${LABEL}-${device}-log.json`, JSON.stringify(log, null, 2))
  expect(errors).toEqual([])
}

test('prompt: desktop 1440x900', async ({ browser }) => {
  test.setTimeout(300_000)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await run(await ctx.newPage(), 'desktop')
  await ctx.close()
})

test('prompt: phone landscape 852x393', async ({ browser }) => {
  test.setTimeout(300_000)
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await run(await ctx.newPage(), 'phone')
  await ctx.close()
})
