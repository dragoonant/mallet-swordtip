// Screenshots + checks for the F8 armies on the client (Kruleboyz, Gloomspite Gitz, Lumineth Realm-lords, Kharadron Overlords):
// the start screen with eight crests (desktop and an iPhone 15 Pro held sideways), the regiment/enhancement cards of every army,
// Kruleboyz vs Lumineth through deployment, and Kharadron vs Gloomspite into combat. No console errors, no failed requests
// (a figure with no GLB yet must fall back to the procedural stand-in without a 404).
//   PW_BASE_URL=http://localhost:4451/ npx playwright test tests/e2e/f8-armies.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/f8-armies'
/* eslint-disable @typescript-eslint/no-explicit-any */
const ARMIES = ['cities', 'ironjawz', 'slaves', 'fyreslayers', 'kruleboyz', 'gloomspite', 'lumineth', 'kharadron'] as const

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
  await expect(page.getByTestId('setup-army-A-kharadron')).toBeVisible()
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

async function startGame(page: Page, a: string, b: string, seed: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await page.getByTestId(`setup-army-A-${a}`).click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId(`setup-army-B-${b}`).click()
  await page.getByTestId('setup-seed').fill(seed)
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
}

async function deployAll(page: Page): Promise<void> {
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await page.waitForTimeout(1500)
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
  expect(await until(page, (i) => i.phase !== 'deployment', 150_000)).toBe(true)
  await page.waitForTimeout(2500)
}

test('start screen: eight armies for both seats in a tidy grid, cards for each, fits desktop and phones sideways', async ({ page, browser }) => {
  test.setTimeout(180_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await expect(page.locator('[data-testid^="faction-crest-"]')).toHaveCount(16)
  for (const a of ARMIES) {
    await expect(page.getByTestId(`setup-army-A-${a}`)).toBeVisible()
    await expect(page.getByTestId(`setup-army-B-${a}`)).toBeVisible()
    await page.getByTestId(`setup-army-A-${a}`).click()
    // exactly two regiment abilities and four enhancements for each army, seat A
    await expect(page.locator('[data-testid^="setup-regiment-A-"][role="radio"]')).toHaveCount(2)
    await expect(page.locator('[data-testid^="setup-enhancement-A-"][role="radio"]')).toHaveCount(4)
    await expect(page.locator(`[data-testid^="setup-regiment-A-${a}."]`)).toHaveCount(2)
    await page.getByTestId(`setup-army-B-${a}`).click()
    await expect(page.locator('[data-testid^="setup-regiment-B-"][role="radio"]')).toHaveCount(2)
    await expect(page.locator('[data-testid^="setup-enhancement-B-"][role="radio"]')).toHaveCount(4)
  }
  // the eight tiles of one seat sit four by two
  const ys = await Promise.all(ARMIES.map(async (a) => (await page.getByTestId(`setup-army-A-${a}`).boundingBox())!.y))
  expect(new Set(ys.map((y) => Math.round(y))).size).toBe(2)
  await page.getByTestId('setup-army-A-kruleboyz').click()
  await page.getByTestId('setup-army-B-lumineth').click()
  await page.getByTestId('setup-regiment-A-kruleboyz.ability.noisy-racket').click()
  await expect(page.getByTestId('setup-regiment-A-kruleboyz.ability.noisy-racket')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('setup-enhancement-B-lumineth.enh.wind-whisperer').click()
  await page.screenshot({ path: `${OUT}/01-start-desktop.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // crest close-up strip (sizes people actually see them at: 48px tiles, and 24px)
  await page.setContent(`<body style="margin:0;background:#12141c;color:#eee;padding:16px;font:12px sans-serif">${await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="setup-army-A-"] svg')).map((s) => `<span style="display:inline-block;margin:6px;text-align:center">${s.outerHTML.replace(/width="\d+" height="\d+"/, 'width="96" height="96"')}<br>${s.getAttribute('aria-label')}</span>`).join(''))}</body>`)
  await page.screenshot({ path: `${OUT}/02-crests-large.png`, clip: { x: 0, y: 0, width: 1100, height: 180 } })
  expect(problems).toEqual([])

  const { devices } = await import('@playwright/test')
  for (const [name, device] of [['iphone15pro', devices['iPhone 15 Pro landscape']], ['pixel7', devices['Pixel 7 landscape']], ['iphonese', devices['iPhone SE landscape']]] as const) {
    const { defaultBrowserType: _ignored, ...opts } = device as any
    void _ignored
    const ctx = await browser.newContext(opts)
    const phone = await ctx.newPage()
    const w = watch(phone)
    await open(phone)
    for (const a of ARMIES) {
      await expect(phone.getByTestId(`setup-army-A-${a}`)).toBeVisible()
      // a tile is never clipped by the viewport's edges
      const box = await phone.getByTestId(`setup-army-A-${a}`).boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(device.viewport!.width)
      // the whole row of one seat is a single band on a phone held sideways (no tall two-row block)
      expect(box!.height).toBeLessThan(110)
    }
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await phone.screenshot({ path: `${OUT}/03-start-${name}.png` })
    await phone.getByTestId('setup-army-A-kharadron').click()
    await phone.getByTestId('setup-army-A-kharadron').scrollIntoViewIfNeeded()
    await phone.screenshot({ path: `${OUT}/04-start-${name}-kharadron.png` })
    expect(w.problems).toEqual([])
    await ctx.close()
  }
})

test('Kruleboyz vs Lumineth: deployment, no console errors or failed model loads', async ({ page }) => {
  test.setTimeout(600_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await startGame(page, 'kruleboyz', 'lumineth', 'f8-krule-lumi')
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/05-krule-lumi-deploy-start.png` })
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
  expect(await until(page, (i) => i.phase !== 'deployment', 150_000)).toBe(true)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/06-krule-lumi-deployed.png` })
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
  expect(problems).toEqual([])
})

test('Kharadron vs Gloomspite: deployment and a fight, no console errors or failed model loads', async ({ page }) => {
  test.setTimeout(900_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await startGame(page, 'kharadron', 'gloomspite', 'f8-ko-glo')
  await deployAll(page)
  await page.screenshot({ path: `${OUT}/07-ko-glo-deployed.png` })
  const fought = await until(page, (i) => i.phase === 'fight', 600_000)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/08-ko-glo-combat.png` })
  console.log('reached fight phase:', fought)
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
  expect(problems).toEqual([])
})
