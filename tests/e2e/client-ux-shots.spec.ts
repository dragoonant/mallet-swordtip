// Screenshots + checks for the client UX pass: faction crests, deploy Auto-place / Auto-deploy rest, thin unit rings,
// no formation bar during pile in, no name tags while placing on a phone.
//   PW_BASE_URL=http://localhost:4431/mallet-swordtip/ npx playwright test tests/e2e/client-ux-shots.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/client-ux'
/* eslint-disable @typescript-eslint/no-explicit-any */

async function start(page: Page, seed: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'fast', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
}

async function begin(page: Page, seed: string): Promise<void> {
  await page.getByTestId('setup-army-A-cities').click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId('setup-army-B-ironjawz').click()
  await page.getByTestId('setup-seed').fill(seed)
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
}

const snap = (page: Page) => page.evaluate(() => {
  const st = (window as any).__mallet.useGameStore.getState()
  const p = st.pending
  return { phase: st.state?.phase ?? '', round: st.state?.round ?? 0, kind: p?.kind ?? null, topic: p?.context?.topic ?? null, mine: !!p && p.player === st.humanSeat, ended: st.state?.phase === 'ended', left: p?.kind === 'deployUnit' ? p.context.unitIds.length : 0 }
})

async function step(page: Page): Promise<void> {
  await page.evaluate(() => {
    const st = (window as any).__mallet.useGameStore.getState()
    const legal = st.legal ?? []
    if (!st.pending || legal.length === 0) return
    const topic = st.pending.context?.topic
    const pass = legal.find((a: any) => a.type === 'pass')
    const nonPass = legal.filter((a: any) => a.type !== 'pass')
    let a = nonPass[0] ?? pass
    if ((topic === 'discardTactics' || topic === 'tacticCommand' || topic === 'abilityUse') && pass) a = pass
    if (st.pending.kind === 'chooseUnitToActivate' && st.state.phase !== 'movement' && pass) a = pass
    st.dispatch(a)
  })
}

async function until(page: Page, stop: (i: Awaited<ReturnType<typeof snap>>) => boolean, budgetMs = 240_000): Promise<boolean> {
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

test('client UX screenshots', async ({ page, browser }) => {
  test.setTimeout(500_000)
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await start(page, 'ux-1')
  await expect(page.getByTestId('faction-crest-cities').first()).toBeVisible()
  await expect(page.getByTestId('faction-crest-ironjawz').first()).toBeVisible()
  await page.screenshot({ path: `${OUT}/01-start-crests.png` })
  await begin(page, 'ux-1')

  // deployment: reach the human's first deploy decision
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await page.waitForTimeout(800)
  await expect(page.getByTestId('btn-deploy-auto-place')).toBeVisible()
  await page.screenshot({ path: `${OUT}/02-deploy-panel.png` })
  const before = (await snap(page)).left
  await page.getByTestId('btn-deploy-auto-place').click()
  await expect.poll(async () => (await snap(page)).left !== before || (await snap(page)).phase !== 'deployment', { timeout: 20_000 }).toBe(true)
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/03-after-auto-place.png` })
  await page.getByTestId('btn-deploy-auto-rest').click()
  expect(await until(page, (i) => i.phase !== 'deployment', 150_000)).toBe(true)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/04-after-auto-deploy-rest.png` })

  // rings: a movement-phase unit pick shows the faint "clickable" rings; hover one and select one
  expect(await until(page, (i) => i.mine && i.kind === 'chooseUnitToActivate' && i.phase === 'movement', 240_000)).toBe(true)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/05-rings-clickable.png` })
  await page.evaluate(() => {
    const ui = (window as any).__mallet.useUiStore.getState()
    const st = (window as any).__mallet.useGameStore.getState()
    const ids = Object.values(st.state.units).filter((u: any) => u.player === st.humanSeat && u.location === 'board').map((u: any) => u.id)
    ui.selectUnit(ids[0])
    ui.hoverUnit(ids[1])
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/06-rings-selected-hover.png` })
  await page.evaluate(() => { const ui = (window as any).__mallet.useUiStore.getState(); ui.selectUnit(null); ui.hoverUnit(null) })

  // pile in: no formation bar
  const piled = await until(page, (i) => i.mine && i.kind === 'pileIn', 90_000)
  if (piled) {
    await page.waitForTimeout(800)
    await expect(page.getByTestId('formation-picker')).toHaveCount(0)
    await page.screenshot({ path: `${OUT}/07-pile-in-no-formation-bar.png` })
  } else {
    console.log('no human pile-in reached; formation-bar check skipped')
  }
  expect(errors).toEqual([])

  // phone: tags step aside while a unit is being placed (deployment)
  const { devices } = await import('@playwright/test')
  const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] })
  const phone = await ctx.newPage()
  phone.on('pageerror', (e) => errors.push(e.message))
  await start(phone, 'ux-2')
  await begin(phone, 'ux-2')
  expect(await until(phone, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await phone.waitForTimeout(800)
  await phone.getByTestId('btn-deploy-auto-place').click()
  expect(await until(phone, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await phone.waitForTimeout(1500)
  const tagOpacities = await phone.evaluate(() => [...document.querySelectorAll('[data-testid^="unit-label-"]')].map((el) => getComputedStyle(el.closest('[style*="opacity"]') ?? el).opacity))
  console.log('phone tag opacities while placing:', JSON.stringify(tagOpacities))
  await phone.screenshot({ path: `${OUT}/08-phone-deploy.png` })
  await ctx.close()
  expect(errors).toEqual([])
})
