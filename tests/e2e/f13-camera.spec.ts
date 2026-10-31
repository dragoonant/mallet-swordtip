// F13 camera framing check: start of a game (deployment view) and the round 1 overview, on a desktop window and a phone in landscape.
//   CAM_LABEL=before|after PW_BASE_URL=http://localhost:4491/mallet-swordtip/ npx playwright test tests/e2e/f13-camera.spec.ts --project=chromium
// Screenshots go to e2e-out/f13-camera/<label>-<device>-<shot>.png; the camera pose is logged beside them.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'e2e-out/f13-camera'
const LABEL = process.env.CAM_LABEL ?? 'after'

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
  const poses: Record<string, unknown> = {}
  const grab = async (name: string) => {
    poses[name] = await page.evaluate(() => (window as any).__malletCamera?.get())
    await page.screenshot({ path: `${OUT}/${LABEL}-${device}-${name}.png` })
  }

  await step(page, (i) => i.kind === 'deployUnit')
  await page.waitForTimeout(2500)
  await grab('1-deployment')

  await step(page, (i) => i.round >= 1 && i.phase === 'movement' && i.kind === 'moveUnit')
  await page.evaluate(() => window.dispatchEvent(new Event('mallet:camera-overview')))
  await page.waitForTimeout(1500)
  await grab('2-round1-overview')

  await page.evaluate(() => (window as any).__mallet.useUiStore.getState().requestCameraPreset?.('top'))
  await page.waitForTimeout(1200)
  await grab('3-round1-top')

  writeFileSync(`${OUT}/${LABEL}-${device}-poses.json`, JSON.stringify(poses, null, 2))
  expect(errors).toEqual([])
}

test('camera framing: desktop 1440x900', async ({ browser }) => {
  test.setTimeout(240_000)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await run(await ctx.newPage(), 'desktop')
  await ctx.close()
})

test('camera framing: phone landscape 852x393', async ({ browser }) => {
  test.setTimeout(240_000)
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await run(await ctx.newPage(), 'phone')
  await ctx.close()
})
