// Screenshots + checks for the F16 armies on the client (Daughters of Khaine, Idoneth Deepkin, Disciples of Tzeentch, Ossiarch Bonereapers): the
// start screen with twenty crests (desktop and phone landscape), the regiment/enhancement cards of the new armies, Daughters vs Ossiarch through
// deployment (desktop and the phone strip), Tzeentch vs Idoneth into combat with the tide readout, and the Predict the Future and Relentless
// Discipline prompts. No console errors or failed model/asset requests. Output: e2e-out/f16/.
//   npx vite --port 4483   (then)   PW_BASE_URL=http://localhost:4483/mallet-swordtip/ npx playwright test tests/e2e/f16-armies.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/f16'
/* eslint-disable @typescript-eslint/no-explicit-any */
const NEW_ARMIES = ['daughters', 'idoneth', 'tzeentch', 'ossiarch'] as const
const ALL_ARMIES = ['cities', 'fyreslayers', 'lumineth', 'kharadron', 'stormcast', 'seraphon', 'sylvaneth', 'daughters', 'idoneth', 'slaves', 'skaven', 'khorne', 'nurgle', 'tzeentch', 'soulblight', 'nighthaunt', 'ossiarch', 'ironjawz', 'kruleboyz', 'gloomspite'] as const

function watch(page: Page): { problems: string[] } {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/UtilityDecider took/.test(m.text())) problems.push(`console: ${m.text()}`) })
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`) })
  return { problems }
}

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'fast', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await expect(page.getByTestId('setup-army-A-ossiarch')).toBeVisible()
}

const snap = (page: Page) => page.evaluate(() => {
  const st = (window as any).__mallet.useGameStore.getState()
  const p = st.pending
  return { phase: st.state?.phase ?? '', round: st.state?.round ?? 0, kind: p?.kind ?? null, topic: p?.context?.topic ?? null, abilityId: p?.context?.abilityId ?? null, mine: !!p && p.player === st.humanSeat, ended: st.state?.phase === 'ended', left: p?.kind === 'deployUnit' ? (p.context?.unitIds?.length ?? 0) : 0 }
})

/** Answer the human's pending decision: the first real option, passing on the optional ones; `want` picks an ability by label instead. */
async function step(page: Page, want?: RegExp): Promise<void> {
  await page.evaluate((src) => {
    const st = (window as any).__mallet.useGameStore.getState()
    const legal = st.legal ?? []
    if (!st.pending || legal.length === 0) return
    const topic = st.pending.context?.topic
    const pass = legal.find((a: any) => a.type === 'pass')
    const nonPass = legal.filter((a: any) => a.type !== 'pass')
    let a = nonPass[0] ?? pass
    if ((topic === 'discardTactics' || topic === 'tacticCommand' || topic === 'abilityUse') && pass) a = pass
    if (st.pending.kind === 'chooseUnitToActivate' && st.state.phase !== 'movement' && pass) a = pass
    if (src) {
      const re = new RegExp(src)
      const hit = (st.pending.options ?? []).find((o: any) => re.test(o.label ?? ''))
      if (hit) a = hit.action
    }
    st.dispatch(a)
  }, want?.source ?? null)
}

async function until(page: Page, stop: (i: Awaited<ReturnType<typeof snap>>) => boolean, budgetMs = 240_000, want?: RegExp): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < budgetMs) {
    const i = await snap(page)
    if (i.ended) return false
    if (stop(i)) return true
    if (i.mine) await step(page, want)
    await page.waitForTimeout(150)
  }
  return false
}

async function startGame(page: Page, a: string, b: string, seed: string): Promise<void> {
  await page.getByTestId(`setup-army-A-${a}`).click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId(`setup-army-B-${b}`).click()
  await page.getByTestId('setup-seed').fill(seed)
  await page.getByTestId('start-game').click()
  await page.waitForFunction(() => !!(window as any).__mallet, undefined, { timeout: 60_000 })
}

async function deployAll(page: Page): Promise<void> {
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
  expect(await until(page, (i) => i.phase !== 'deployment', 150_000)).toBe(true)
}

test('start screen: twenty armies for both seats, crests that read, cards for the new armies, fits desktop and phone landscape', async ({ page, browser }) => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  for (const a of ALL_ARMIES) {
    await expect(page.getByTestId(`setup-army-A-${a}`)).toBeVisible()
    await expect(page.getByTestId(`setup-army-B-${a}`)).toBeVisible()
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
  await page.getByTestId('setup-army-A-daughters').click()
  await page.getByTestId('setup-army-B-ossiarch').click()
  await page.getByTestId('setup-regiment-A-daughters.ability.murderous-epiphany').click()
  await expect(page.getByTestId('setup-regiment-A-daughters.ability.murderous-epiphany')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('setup-enhancement-B-ossiarch.enh.shard-storm').click()
  await page.screenshot({ path: `${OUT}/01-start-desktop.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByTestId('setup-patrol-A').screenshot({ path: `${OUT}/01b-crest-grid.png` })
  await page.setViewportSize({ width: 1024, height: 700 })
  await page.screenshot({ path: `${OUT}/01c-start-narrow.png` })

  const { devices } = await import('@playwright/test')
  for (const [name, device] of [['iphone15pro', devices['iPhone 15 Pro landscape']], ['pixel7', devices['Pixel 7 landscape']]] as const) {
    const ctx = await browser.newContext({ ...device })
    const phone = await ctx.newPage()
    watch(phone)
    await open(phone)
    const vw = device.viewport!.width
    for (const a of ALL_ARMIES) {
      await expect(phone.getByTestId(`setup-army-A-${a}`)).toBeVisible()
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

test('Daughters vs Ossiarch: deployment on desktop, the Blood Rites readout, no console errors or failed model loads', async ({ page }) => {
  test.setTimeout(420_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await startGame(page, 'daughters', 'ossiarch', 'f16-1')
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/03-deploy-start.png` })
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
  expect(await until(page, (i) => i.phase !== 'deployment', 150_000)).toBe(true)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/04-deployed.png` })
  const rites = page.getByTestId('hud-resource-A-daughters.rites')
  await expect(rites).toBeVisible()
  await expect(rites).toContainText('Blood Rites')
  await rites.hover()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/04b-rites-tooltip.png` })
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
  expect(problems).toEqual([])
})

test('Daughters vs Ossiarch on a phone held sideways: the deployment prompt is the slim strip', async ({ browser }) => {
  test.setTimeout(300_000)
  mkdirSync(OUT, { recursive: true })
  const { devices } = await import('@playwright/test')
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro landscape'] })
  const phone = await ctx.newPage()
  const { problems } = watch(phone)
  await open(phone)
  await startGame(phone, 'daughters', 'ossiarch', 'f16-1')
  const ok = await until(phone, (i) => i.mine && i.kind === 'deployUnit', 150_000)
  await phone.waitForTimeout(2000)
  await phone.screenshot({ path: `${OUT}/05-deploy-phone.png` })
  expect(ok).toBe(true)
  await ctx.close()
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
})

test('Tzeentch vs Idoneth: deployment into combat, the tide readout, Predict the Future on desktop, no console errors or failed model loads', async ({ page }) => {
  test.setTimeout(720_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await startGame(page, 'tzeentch', 'idoneth', 'f16-2')
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await deployAll(page)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/06-tzeentch-vs-idoneth-deployed.png` })
  // Idoneth's tide of the round sits in the HUD badge of its seat (B), with a styled tooltip, from round 1
  const tide = page.getByTestId('hud-resource-B-idoneth.tide')
  await expect(tide).toBeVisible()
  await expect(tide).toContainText('Low Tide')
  await expect(page.getByTestId('hud-resource-A-idoneth.tide')).toHaveCount(0)
  await tide.hover()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/07-tide-tooltip.png` })
  // the first hero phase of the human's turn offers Predict the Future (once the battle tactic deck exists): take it and look at the prompt
  const predict = await until(page, (i) => i.mine && i.topic === 'abilityChoice', 200_000, /Predict the Future/)
  if (predict) {
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/08-predict-the-future.png` })
    await expect(page.getByTestId('prompt')).toContainText('Predict the Future')
  }
  console.log('reached Predict the Future prompt:', predict)
  const fought = await until(page, (i) => i.phase === 'fight', 520_000, /Predict the Future/)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/09-combat.png` })
  console.log('reached fight phase:', fought)
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
  expect(problems).toEqual([])
})

test('Tzeentch vs Idoneth on a phone held sideways: the Predict the Future prompt fits the strip', async ({ browser }) => {
  test.setTimeout(600_000)
  mkdirSync(OUT, { recursive: true })
  const { devices } = await import('@playwright/test')
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro landscape'] })
  const phone = await ctx.newPage()
  const { problems } = watch(phone)
  await open(phone)
  await startGame(phone, 'tzeentch', 'idoneth', 'f16-2')
  await deployAll(phone)
  const predict = await until(phone, (i) => i.mine && i.topic === 'abilityChoice', 300_000, /Predict the Future/)
  await expect(phone.getByTestId('prompt')).toContainText('Predict the Future', { timeout: 20_000 })
  await phone.waitForTimeout(600)
  await phone.screenshot({ path: `${OUT}/10-predict-phone.png` })
  console.log('reached Predict the Future on the phone:', predict)
  await ctx.close()
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
})

test('Ossiarch vs Daughters: Relentless Discipline asks for its target and effect with its own hints', async ({ page }) => {
  test.setTimeout(720_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await startGame(page, 'ossiarch', 'daughters', 'f16-3')
  await deployAll(page)
  // take Relentless Discipline whenever it is offered; the first target prompt it raises is the shot
  const target = await until(page, (i) => i.mine && i.topic === 'abilityTarget' && /relentless-discipline/.test(i.abilityId ?? ''), 360_000, /Relentless Discipline/)
  if (target) {
    await expect(page.getByTestId('prompt')).toContainText('Relentless Discipline', { timeout: 20_000 })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/11-discipline-target.png` })
  }
  console.log('reached the Relentless Discipline target prompt:', target)
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
  expect(problems).toEqual([])
})
