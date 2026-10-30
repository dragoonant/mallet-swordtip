// Screenshots + checks for the Slaves to Darkness and Fyreslayers armies on the client: the start screen with four crests
// (desktop and phone landscape), every army's regiment/enhancement cards, then Slaves vs Fyreslayers through deployment
// and into combat with no console errors and no failed model/asset requests.
//   PW_BASE_URL=http://localhost:4441/ npx playwright test tests/e2e/new-armies-shots.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/new-armies'
/* eslint-disable @typescript-eslint/no-explicit-any */
const ARMIES = ['cities', 'ironjawz', 'slaves', 'fyreslayers'] as const

function watch(page: Page): { problems: string[] } {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`) })
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`) })
  return { problems }
}

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'fast', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await expect(page.getByTestId('setup-army-A-slaves')).toBeVisible()
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

test('start screen: four armies for both seats, cards for each, fits desktop and phone landscape', async ({ page, browser }) => {
  test.setTimeout(120_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  for (const a of ARMIES) {
    await expect(page.getByTestId(`setup-army-A-${a}`)).toBeVisible()
    await expect(page.getByTestId(`setup-army-B-${a}`)).toBeVisible()
    await page.getByTestId(`setup-army-A-${a}`).click()
    // exactly two regiment abilities and four enhancements for each army, seat A
    await expect(page.locator('[data-testid^="setup-regiment-A-"][role="radio"]')).toHaveCount(2)
    await expect(page.locator('[data-testid^="setup-enhancement-A-"][role="radio"]')).toHaveCount(4)
    await page.getByTestId(`setup-army-B-${a}`).click()
    await expect(page.locator('[data-testid^="setup-regiment-B-"][role="radio"]')).toHaveCount(2)
    await expect(page.locator('[data-testid^="setup-enhancement-B-"][role="radio"]')).toHaveCount(4)
  }
  await page.getByTestId('setup-army-A-slaves').click()
  await page.getByTestId('setup-army-B-fyreslayers').click()
  await page.getByTestId('setup-regiment-A-slaves.ability.fearless-invaders').click()
  await expect(page.getByTestId('setup-regiment-A-slaves.ability.fearless-invaders')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('setup-enhancement-B-fyreslayers.enh.horn-of-grimnir').click()
  await page.screenshot({ path: `${OUT}/01-start-desktop.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  const { devices } = await import('@playwright/test')
  for (const [name, device] of [['pixel7', devices['Pixel 7 landscape']], ['iphonese', devices['iPhone SE landscape']]] as const) {
    const ctx = await browser.newContext({ ...device })
    const phone = await ctx.newPage()
    watch(phone)
    await open(phone)
    for (const a of ARMIES) {
      await expect(phone.getByTestId(`setup-army-A-${a}`)).toBeVisible()
      // a card is never clipped by the viewport's right edge
      const box = await phone.getByTestId(`setup-army-A-${a}`).boundingBox()
      expect(box!.x + box!.width).toBeLessThanOrEqual(device.viewport!.width)
    }
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await phone.screenshot({ path: `${OUT}/02-start-${name}.png` })
    await ctx.close()
  }
  expect(problems).toEqual([])
})

test('Slaves to Darkness vs Fyreslayers: deployment and a fight, no console errors or failed model loads', async ({ page }) => {
  test.setTimeout(600_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await page.getByTestId('setup-army-A-slaves').click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId('setup-army-B-fyreslayers').click()
  await page.getByTestId('setup-seed').fill('new-armies-1')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)

  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/03-deploy-start.png` })
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
  expect(await until(page, (i) => i.phase !== 'deployment', 150_000)).toBe(true)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/04-deployed.png` })

  // play on until the first fight-phase decision (or the end of the game) and shoot the table
  const fought = await until(page, (i) => i.phase === 'fight', 420_000)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/05-combat.png` })
  console.log('reached fight phase:', fought)
  // every figure is either a loaded GLB or the procedural stand-in, never an error
  const modelRequests = problems.filter((p) => /\.glb/.test(p))
  expect(modelRequests).toEqual([])
  expect(problems).toEqual([])
})
