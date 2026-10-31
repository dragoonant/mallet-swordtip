// F12 client check: the start screen with all twelve crests (desktop, and an iPhone 15 Pro held sideways at 852x393), every army's
// regiment/enhancement cards, then Stormcast vs Skaven through deployment and Seraphon vs Soulblight into combat with no console
// errors and no failed model/asset requests. Screenshots go to e2e-out/f12/.
//   PW_BASE_URL=http://localhost:4471/ npx playwright test tests/e2e/f12-armies.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/f12'
/* eslint-disable @typescript-eslint/no-explicit-any */
const ARMIES = ['cities', 'fyreslayers', 'lumineth', 'kharadron', 'stormcast', 'seraphon', 'slaves', 'skaven', 'soulblight', 'ironjawz', 'kruleboyz', 'gloomspite'] as const
const NEW = ['stormcast', 'skaven', 'seraphon', 'soulblight'] as const

function watch(page: Page): { problems: string[] } {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/\[bot\] UtilityDecider took/.test(m.text())) problems.push(`console: ${m.text()}`) })
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`) })
  return { problems }
}

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'fast', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await expect(page.getByTestId('setup-army-A-stormcast')).toBeVisible()
}

const snap = (page: Page) => page.evaluate(() => {
  const st = (window as any).__mallet.useGameStore.getState()
  const p = st.pending
  return { phase: st.state?.phase ?? '', round: st.state?.round ?? 0, kind: p?.kind ?? null, mine: !!p && p.player === st.humanSeat, ended: st.state?.phase === 'ended' }
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

async function play(page: Page, a: string, b: string, seed: string, shots: { deployStart?: string; deployed?: string; combat?: string }): Promise<{ problems: string[]; fought: boolean }> {
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await page.getByTestId(`setup-army-A-${a}`).click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId(`setup-army-B-${b}`).click()
  await page.getByTestId('setup-seed').fill(seed)
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)

  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await page.waitForTimeout(1500)
  if (shots.deployStart) await page.screenshot({ path: `${OUT}/${shots.deployStart}` })
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
  expect(await until(page, (i) => i.phase !== 'deployment', 150_000)).toBe(true)
  await page.waitForTimeout(3000)
  if (shots.deployed) await page.screenshot({ path: `${OUT}/${shots.deployed}` })
  let fought = false
  if (shots.combat) {
    fought = await until(page, (i) => i.phase === 'fight', 420_000)
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${OUT}/${shots.combat}` })
  }
  return { problems, fought }
}

test('start screen: twelve armies for both seats, grouped by alliance, cards for each, fits desktop and phone landscape', async ({ page, browser }) => {
  test.setTimeout(180_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  for (const a of ARMIES) {
    await expect(page.getByTestId(`setup-army-A-${a}`)).toBeVisible()
    await expect(page.getByTestId(`setup-army-B-${a}`)).toBeVisible()
    await expect(page.getByTestId(`faction-crest-${a}`).first()).toBeVisible()
  }
  expect(await page.locator('[data-testid="setup-patrol-A"] button').count()).toBe(12)
  for (const a of NEW) {
    await page.getByTestId(`setup-army-A-${a}`).click()
    // exactly two regiment abilities and four enhancements for each new army, seat A, and its alliance line
    await expect(page.locator('[data-testid^="setup-regiment-A-"][role="radio"]')).toHaveCount(2)
    await expect(page.locator('[data-testid^="setup-enhancement-A-"][role="radio"]')).toHaveCount(4)
    await expect(page.getByTestId('setup-alliance-A')).toContainText('Grand Alliance')
    await page.getByTestId(`setup-army-B-${a}`).click()
    await expect(page.locator('[data-testid^="setup-regiment-B-"][role="radio"]')).toHaveCount(2)
    await expect(page.locator('[data-testid^="setup-enhancement-B-"][role="radio"]')).toHaveCount(4)
  }
  await page.getByTestId('setup-army-A-stormcast').click()
  await page.getByTestId('setup-army-B-skaven').click()
  await page.getByTestId('setup-regiment-A-stormcast.ability.strike-where-needed').click()
  await expect(page.getByTestId('setup-regiment-A-stormcast.ability.strike-where-needed')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('setup-enhancement-B-skaven.enh.skitterleap').click()
  await page.screenshot({ path: `${OUT}/01-start-desktop.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  const { devices } = await import('@playwright/test')
  // iPhone 15 Pro held sideways (852x393, the full screen, as when added to the home screen). The project runs Chromium here, so borrow the iPhone's touch and agent.
  const iphone = devices['iPhone 15 Pro landscape']
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: iphone.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: iphone.userAgent })
  const phone = await ctx.newPage()
  const phoneWatch = watch(phone)
  await open(phone)
  for (const a of ARMIES) {
    const tile = phone.getByTestId(`setup-army-A-${a}`)
    await expect(tile).toBeVisible()
    // a tile is never clipped by the viewport's right edge
    const box = await tile.boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(852)
    expect(box!.height).toBeGreaterThanOrEqual(40)
  }
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await phone.screenshot({ path: `${OUT}/02-start-iphone15pro-landscape.png` })
  await phone.getByTestId('setup-army-B-soulblight').scrollIntoViewIfNeeded()
  await phone.screenshot({ path: `${OUT}/03-start-iphone15pro-opponent.png` })
  await ctx.close()
  expect(problems).toEqual([])
  expect(phoneWatch.problems).toEqual([])
})

test('Stormcast vs Skaven: deployment, no console errors or failed model loads', async ({ page }) => {
  test.setTimeout(600_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = await play(page, 'stormcast', 'skaven', 'f12-a', { deployStart: '04-stormcast-skaven-deploy-start.png', deployed: '05-stormcast-skaven-deployed.png' })
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
  expect(problems).toEqual([])
})

test('Seraphon vs Soulblight: deployment and a fight, no console errors or failed model loads', async ({ page }) => {
  test.setTimeout(600_000)
  mkdirSync(OUT, { recursive: true })
  const { problems, fought } = await play(page, 'seraphon', 'soulblight', 'f12-b', { deployed: '06-seraphon-soulblight-deployed.png', combat: '07-seraphon-soulblight-combat.png' })
  console.log('reached fight phase:', fought)
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
  expect(problems).toEqual([])
})
