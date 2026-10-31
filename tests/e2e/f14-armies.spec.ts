// Screenshots + checks for the F14 armies on the client (Blades of Khorne, Maggotkin of Nurgle, Nighthaunt, Sylvaneth): the start screen
// with sixteen crests (desktop and phone landscape), the regiment/enhancement cards of the new armies, Khorne vs Sylvaneth through
// deployment (desktop and phone strip mode) and Nighthaunt vs Nurgle into combat with the Disease readout, no console errors or failed
// model/asset requests. Output: e2e-out/f14/.
//   PW_BASE_URL=http://localhost:4475/ npx playwright test tests/e2e/f14-armies.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/f14'
/* eslint-disable @typescript-eslint/no-explicit-any */
const NEW_ARMIES = ['khorne', 'nurgle', 'nighthaunt', 'sylvaneth'] as const
const ALL_ARMIES = ['cities', 'fyreslayers', 'lumineth', 'kharadron', 'stormcast', 'seraphon', 'sylvaneth', 'slaves', 'skaven', 'khorne', 'nurgle', 'soulblight', 'nighthaunt', 'ironjawz', 'kruleboyz', 'gloomspite'] as const

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
  await expect(page.getByTestId('setup-army-A-khorne')).toBeVisible()
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

test('start screen: sixteen armies for both seats, crests that read, cards for the new armies, fits desktop and phone landscape', async ({ page, browser }) => {
  test.setTimeout(180_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  for (const a of ALL_ARMIES) {
    await expect(page.getByTestId(`setup-army-A-${a}`)).toBeVisible()
    await expect(page.getByTestId(`setup-army-B-${a}`)).toBeVisible()
    // a crest in every tile, not the plain fallback shield
    await expect(page.getByTestId(`setup-army-A-${a}`).getByTestId(`faction-crest-${a}`)).toHaveCount(1)
  }
  for (const a of NEW_ARMIES) {
    await page.getByTestId(`setup-army-A-${a}`).click()
    await expect(page.locator('[data-testid^="setup-regiment-A-"][role="radio"]')).toHaveCount(2)
    await expect(page.locator('[data-testid^="setup-enhancement-A-"][role="radio"]')).toHaveCount(4)
    await expect(page.getByTestId('setup-alliance-A')).toBeVisible()
    await page.getByTestId(`setup-army-B-${a}`).click()
    await expect(page.locator('[data-testid^="setup-regiment-B-"][role="radio"]')).toHaveCount(2)
    await expect(page.locator('[data-testid^="setup-enhancement-B-"][role="radio"]')).toHaveCount(4)
  }
  await page.getByTestId('setup-army-A-khorne').click()
  await page.getByTestId('setup-army-B-sylvaneth').click()
  await page.getByTestId('setup-regiment-A-khorne.ability.savagery-upon-savagery').click()
  await expect(page.getByTestId('setup-regiment-A-khorne.ability.savagery-upon-savagery')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('setup-enhancement-B-sylvaneth.enh.zephyrkin').click()
  await page.screenshot({ path: `${OUT}/01-start-desktop.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // a close-up of the sixteen crests (retina scale) to judge them at tile size
  await page.getByTestId('setup-patrol-A').screenshot({ path: `${OUT}/01b-crest-grid.png` })

  const { devices } = await import('@playwright/test')
  for (const [name, device] of [['iphone15pro', devices['iPhone 15 Pro landscape']], ['pixel7', devices['Pixel 7 landscape']]] as const) {
    const ctx = await browser.newContext({ ...device })
    const phone = await ctx.newPage()
    watch(phone)
    await open(phone)
    const vw = device.viewport!.width
    for (const a of ALL_ARMIES) {
      await expect(phone.getByTestId(`setup-army-A-${a}`)).toBeVisible()
      // a tile is never clipped by the viewport's right edge
      const box = await phone.getByTestId(`setup-army-A-${a}`).boundingBox()
      expect(box!.x + box!.width).toBeLessThanOrEqual(vw)
      expect(box!.x).toBeGreaterThanOrEqual(0)
    }
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await phone.screenshot({ path: `${OUT}/02-start-${name}.png` })
    await ctx.close()
  }
  expect(problems).toEqual([])
})

test('Khorne vs Sylvaneth: deployment on desktop, no console errors or failed model loads', async ({ page, browser }) => {
  test.setTimeout(420_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await page.getByTestId('setup-army-A-khorne').click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId('setup-army-B-sylvaneth').click()
  await page.getByTestId('setup-seed').fill('f14-1')
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
  const modelRequests = problems.filter((p) => /\.glb/.test(p))
  expect(modelRequests).toEqual([])
  expect(problems).toEqual([])

})

test('Khorne vs Sylvaneth on a phone held sideways: the deployment prompt is the slim strip', async ({ browser }) => {
  test.setTimeout(300_000)
  mkdirSync(OUT, { recursive: true })
  const { devices } = await import('@playwright/test')
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro landscape'] })
  const phone = await ctx.newPage()
  const { problems } = watch(phone)
  await open(phone)
  await phone.getByTestId('setup-army-A-khorne').click()
  await phone.getByRole('button', { name: /^Bot$/ }).click()
  await phone.getByTestId('setup-army-B-sylvaneth').click()
  await phone.getByTestId('setup-seed').fill('f14-1')
  await phone.getByTestId('start-game').click()
  await phone.waitForFunction(() => !!(window as any).__mallet, undefined, { timeout: 60_000 })
  const ok = await until(phone, (i) => i.mine && i.kind === 'deployUnit', 150_000)
  await phone.waitForTimeout(2000)
  await phone.screenshot({ path: `${OUT}/05-deploy-phone.png` })
  expect(ok).toBe(true)
  await ctx.close()
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
})

test('Nighthaunt vs Nurgle: deployment into combat, the Disease readout in the HUD, no console errors or failed model loads', async ({ page }) => {
  test.setTimeout(720_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await page.getByTestId('setup-army-A-nighthaunt').click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId('setup-army-B-nurgle').click()
  await page.getByTestId('setup-seed').fill('f14-2')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
  expect(await until(page, (i) => i.phase !== 'deployment', 150_000)).toBe(true)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/06-nh-vs-nurgle-deployed.png` })
  // Nurgle's Disease counter sits in the HUD badge of its seat (B) with a styled tooltip, from the very first round
  const disease = page.getByTestId('hud-resource-B-nurgle-disease')
  await expect(disease).toBeVisible()
  await expect(disease).toContainText('Disease')
  await expect(page.getByTestId('hud-resource-A-nurgle-disease')).toHaveCount(0)
  await disease.hover()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/07-disease-tooltip.png` })
  const fought = await until(page, (i) => i.phase === 'fight', 520_000)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/08-combat.png` })
  console.log('reached fight phase:', fought)
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
  expect(problems).toEqual([])
})
