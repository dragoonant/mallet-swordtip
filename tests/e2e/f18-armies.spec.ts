// Screenshots + checks for the F18 armies on the client (Hedonites of Slaanesh, Helsmiths of Hashut, Flesh-eater Courts, Ogor Mawtribes, Sons of
// Behemat): the start screen with twenty-five crests (desktop and phone landscape), Slaanesh vs Ogors through deployment (desktop and the phone
// strip), Sons of Behemat vs Flesh-eater Courts into combat (huge bases, labels, the Noble Deeds readout), and the Helsmiths deployment-phase
// Grinding Advance prompts (offer, multi-target pick, slide). No console errors or failed model/asset requests. Output: e2e-out/f18/.
//   npx vite --port 4487   (then)   PW_BASE_URL=http://localhost:4487/mallet-swordtip/ npx playwright test tests/e2e/f18-armies.spec.ts --project=chromium
// `F18_NOGLB=1` answers 404 for every GLB so the procedural stand-ins draw (the tall-pillar nit).
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/f18'
/* eslint-disable @typescript-eslint/no-explicit-any */
const NEW_ARMIES = ['slaanesh', 'helsmiths', 'fec', 'ogors', 'behemat'] as const
const ALL_ARMIES = ['cities', 'fyreslayers', 'lumineth', 'kharadron', 'stormcast', 'seraphon', 'sylvaneth', 'daughters', 'idoneth', 'slaves', 'skaven', 'khorne', 'nurgle', 'tzeentch', 'slaanesh', 'helsmiths', 'soulblight', 'nighthaunt', 'ossiarch', 'fec', 'ironjawz', 'kruleboyz', 'gloomspite', 'ogors', 'behemat'] as const

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
  if (process.env.F18_NOGLB) await page.route('**/*.glb', (r) => r.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await expect(page.getByTestId('setup-army-A-behemat')).toBeVisible()
}

const snap = (page: Page) => page.evaluate(() => {
  const st = (window as any).__mallet.useGameStore.getState()
  const p = st.pending
  return { phase: st.state?.phase ?? '', round: st.state?.round ?? 0, kind: p?.kind ?? null, topic: p?.context?.topic ?? null, abilityId: p?.context?.abilityId ?? null, window: p?.context?.data?.window ?? null, multi: p?.context?.data?.multi ?? null, mine: !!p && p.player === st.humanSeat, ended: st.state?.phase === 'ended' || !!st.state?.result }
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

async function startGame(page: Page, a: string, b: string, seed: string, pick?: (page: Page) => Promise<void>): Promise<void> {
  await page.getByTestId(`setup-army-A-${a}`).click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId(`setup-army-B-${b}`).click()
  if (pick) await pick(page)
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

test('start screen: twenty-five armies for both seats, crests that read, cards for the new armies, fits desktop and phone landscape', async ({ page, browser }) => {
  test.setTimeout(300_000)
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
  await page.getByTestId('setup-army-A-slaanesh').click()
  await page.getByTestId('setup-army-B-behemat').click()
  await page.getByTestId('setup-regiment-A-slaanesh.ability.daemonic-onslaught').click()
  await expect(page.getByTestId('setup-regiment-A-slaanesh.ability.daemonic-onslaught')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('setup-enhancement-B-behemat.enh.lucky-rock').click()
  await page.screenshot({ path: `${OUT}/01-start-desktop.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByTestId('setup-patrol-A').screenshot({ path: `${OUT}/01b-crest-grid.png` })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.screenshot({ path: `${OUT}/01c-start-720p.png` })
  await page.setViewportSize({ width: 1024, height: 700 })
  await page.screenshot({ path: `${OUT}/01d-start-narrow.png` })

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
    await phone.getByTestId('setup-army-A-ogors').scrollIntoViewIfNeeded()
    await phone.getByTestId('setup-army-A-ogors').click()
    await phone.waitForTimeout(300)
    await phone.screenshot({ path: `${OUT}/02b-start-${name}-ogors.png` })
    await ctx.close()
  }
  expect(problems).toEqual([])
})

test('Slaanesh vs Ogors: deployment on desktop, the Favour readout, no console errors or failed model loads', async ({ page }) => {
  test.setTimeout(420_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await startGame(page, 'slaanesh', 'ogors', 'f18-1')
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/03-deploy-start.png` })
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
  expect(await until(page, (i) => i.phase !== 'deployment', 150_000)).toBe(true)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/04-slaanesh-vs-ogors-deployed.png` })
  const favour = page.getByTestId('hud-resource-A-slaanesh.favour')
  await expect(favour).toBeVisible()
  await expect(favour).toContainText('Favour')
  await favour.hover()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/04b-favour-tooltip.png` })
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
  expect(problems).toEqual([])
})

test('Slaanesh vs Ogors on a phone held sideways: the deployment prompt is the slim strip', async ({ browser }) => {
  test.setTimeout(300_000)
  mkdirSync(OUT, { recursive: true })
  const { devices } = await import('@playwright/test')
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro landscape'] })
  const phone = await ctx.newPage()
  const { problems } = watch(phone)
  await open(phone)
  await startGame(phone, 'slaanesh', 'ogors', 'f18-1')
  const ok = await until(phone, (i) => i.mine && i.kind === 'deployUnit', 150_000)
  await phone.waitForTimeout(2000)
  await phone.screenshot({ path: `${OUT}/05-deploy-phone.png` })
  expect(ok).toBe(true)
  await ctx.close()
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
})

test('Sons of Behemat vs Flesh-eater Courts: deployment into combat, 90mm bases, labels, Noble Deeds readout, Drop Toss or Roll', async ({ page }) => {
  test.setTimeout(900_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await startGame(page, 'behemat', 'fec', 'f18-2')
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await deployAll(page)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/06-behemat-vs-fec-deployed.png` })
  // the Flesh-eater Heroes' tallies sit in seat B's badge with a styled tooltip
  const deeds = page.locator('[data-testid^="hud-resource-B-fec.deeds."]')
  await expect(deeds.first()).toBeVisible()
  await deeds.first().hover()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/07-deeds-tooltip.png` })
  // Drop, Toss or Roll in the first shooting phase of the human's turn: take it and look at the prompt
  const dtr = await until(page, (i) => i.mine && i.topic === 'abilityMode' && /drop-toss-or-roll/.test(i.abilityId ?? ''), 260_000, /Drop, Toss or Roll/)
  if (dtr) {
    await expect(page.getByTestId('prompt')).toContainText('Drop, Toss or Roll', { timeout: 20_000 })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/08-drop-toss-roll.png` })
  }
  console.log('reached the Drop, Toss or Roll prompt:', dtr)
  const fought = await until(page, (i) => i.phase === 'fight', 520_000, /Drop, Toss or Roll/)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/09-combat.png` })
  console.log('reached fight phase:', fought)
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
  expect(problems).toEqual([])
})

test('Helsmiths (Grinding Advance) vs Slaanesh: the deployment-phase offer, the two-target pick and the slide, on desktop and the phone strip', async ({ page, browser }) => {
  test.setTimeout(900_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await startGame(page, 'helsmiths', 'slaanesh', 'f18-3', async (p) => { await p.getByTestId('setup-regiment-A-helsmiths.ability.grinding-advance').click() })
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
  const offer = await until(page, (i) => i.mine && i.topic === 'abilityUse' && i.window === 'deployment', 200_000)
  console.log('reached the deployment-phase ability offer:', offer)
  if (offer) {
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/10-deployment-offer.png` })
    await expect(page.getByTestId('prompt')).toContainText('set up')
    await step(page, /Grinding Advance/)
    const target = await until(page, (i) => i.mine && i.topic === 'abilityTarget' && i.multi === true, 30_000)
    console.log('reached the multi-target pick:', target)
    if (target) {
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${OUT}/11-grinding-advance-pick.png` })
      await expect(page.getByTestId('prompt')).toContainText('pick target 1')
      await step(page)
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${OUT}/12-grinding-advance-pick2.png` })
    }
    const slide = await until(page, (i) => i.mine && i.topic === 'abilityMode', 30_000)
    if (slide) {
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${OUT}/13-grinding-advance-slide.png` })
    }
  }
  expect(offer).toBe(true)
  // Harness Daemonic Power is the first thing the Helsmiths do in their hero phase: its hand-out reads as points, not disease
  const harness = await until(page, (i) => i.mine && i.topic === 'abilityChoice' && /harness/.test(i.abilityId ?? ''), 300_000)
  console.log('reached the Harness hand-out:', harness)
  if (harness) {
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/14-harness.png` })
    await expect(page.getByTestId('prompt')).toContainText('Harness Daemonic Power')
    await expect(page.getByTestId('prompt')).not.toContainText('disease')
    const pool = page.locator('[data-testid^="hud-resource-A-helsmiths"]')
    await expect(pool.first()).toBeVisible()
  }
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
  expect(problems).toEqual([])

  // the same offer on a phone held sideways sits in the strip
  const { devices } = await import('@playwright/test')
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro landscape'] })
  const phone = await ctx.newPage()
  const phoneProblems = watch(phone).problems
  await open(phone)
  await startGame(phone, 'helsmiths', 'slaanesh', 'f18-3', async (p) => {
    await p.getByTestId('setup-regiment-A-helsmiths.ability.grinding-advance').scrollIntoViewIfNeeded()
    await p.getByTestId('setup-regiment-A-helsmiths.ability.grinding-advance').click()
  })
  await deployAllPhone(phone)
  const phoneOffer = await until(phone, (i) => i.mine && i.topic === 'abilityUse' && i.window === 'deployment', 200_000)
  await phone.waitForTimeout(800)
  await phone.screenshot({ path: `${OUT}/15-deployment-offer-phone.png` })
  console.log('reached the deployment-phase ability offer on the phone:', phoneOffer)
  if (phoneOffer) {
    await step(phone, /Grinding Advance/)
    await until(phone, (i) => i.mine && i.topic === 'abilityTarget' && i.multi === true, 30_000)
    await phone.waitForTimeout(800)
    await phone.screenshot({ path: `${OUT}/16-grinding-advance-pick-phone.png` })
  }
  await ctx.close()
  expect(phoneProblems.filter((p) => /\.glb/.test(p))).toEqual([])
})

async function deployAllPhone(page: Page): Promise<void> {
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 150_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
}

test('close-up camera over the Behemat objective: gargant bases, unit labels clear of the objective label', async ({ page }) => {
  test.setTimeout(300_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await startGame(page, 'behemat', 'fec', 'f18-2')
  await deployAll(page)
  await page.waitForTimeout(2000)
  // the objective nearest the human's deployment edge (Behemat sits on the left, x < 0)
  const objs = await page.evaluate(() => Object.values((window as any).__mallet.useGameStore.getState().state.objectives).filter((o: any) => !o.removed).map((o: any) => ({ x: o.pos.x, z: o.pos.z })))
  const near = [...objs].sort((a: any, b: any) => a.x - b.x)[0] as { x: number; z: number }
  await page.evaluate(([x, z]) => (window as any).__malletCamera.lookAt(x, z, 14), [near.x, near.z])
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/17-closeup-objective.png` })
  const overlaps = await page.evaluate(() => {
    const rects = (sel: string) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)
    const objs = rects('[data-testid^="objective-label-"]')
    const units = rects('[data-testid^="unit-label-"]')
    let n = 0
    for (const o of objs) for (const u of units) if (o.left < u.right && u.left < o.right && o.top < u.bottom && u.top < o.bottom) n++
    return n
  })
  expect(overlaps).toBe(0)
  expect(problems.filter((p) => /\.glb/.test(p))).toEqual([])
})
