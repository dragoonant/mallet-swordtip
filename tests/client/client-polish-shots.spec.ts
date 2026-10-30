// Screenshots for the client-polish pass: a mirror match (two readable names), thin selected/hover rings on the big oval
// cannon base, and the card / redeploy prompts (extraTactic, bottomTactic, Magmic Tunnels spots lit on the board).
//   PW_BASE_URL=http://localhost:4451/ npx playwright test tests/e2e/client-polish-shots.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/client-polish'
/* eslint-disable @typescript-eslint/no-explicit-any */

function watch(page: Page): { problems: string[] } {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`) })
  return { problems }
}

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'fast', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
}

const snap = (page: Page) => page.evaluate(() => {
  const st = (window as any).__mallet.useGameStore.getState()
  const p = st.pending
  return { phase: st.state?.phase ?? '', round: st.state?.round ?? 0, kind: p?.kind ?? null, topic: p?.context?.topic ?? null, redeploy: p?.context?.data?.redeploy === true, mine: !!p && p.player === st.humanSeat, ended: st.state?.phase === 'ended', left: p?.kind === 'deployUnit' ? p.context.unitIds.length : 0 }
})

/** Answers the human's pending decision with the first non-pass option (pass for the routine ones). */
async function step(page: Page): Promise<void> {
  await page.evaluate(() => {
    const st = (window as any).__mallet.useGameStore.getState()
    const legal = st.legal ?? []
    if (!st.pending || legal.length === 0) return
    const topic = st.pending.context?.topic
    const pass = legal.find((a: any) => a.type === 'pass')
    const nonPass = legal.filter((a: any) => a.type !== 'pass')
    let a = nonPass[0] ?? pass
    if ((topic === 'discardTactics' || topic === 'tacticCommand') && pass) a = pass
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

async function startGame(page: Page, a: string, b: string, opts: { regimentA?: string; enhancementA?: string; seed: string }): Promise<void> {
  await open(page)
  await page.getByTestId(`setup-army-A-${a}`).click()
  if (opts.regimentA) await page.getByTestId(`setup-regiment-A-${opts.regimentA}`).click()
  if (opts.enhancementA) await page.getByTestId(`setup-enhancement-A-${opts.enhancementA}`).click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId(`setup-army-B-${b}`).click()
  await page.getByTestId('setup-seed').fill(opts.seed)
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
}

async function deployAll(page: Page): Promise<void> {
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 90_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
  // the first prompts after set-up (first turn, Magmic Tunnels, tactic draws) still happen while the phase says deployment
  expect(await until(page, (i) => i.kind === 'chooseOption' || i.phase !== 'deployment', 150_000)).toBe(true)
}

test('mirror match and thin rings on the cannon base', async ({ page }) => {
  test.setTimeout(420_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await startGame(page, 'cities', 'cities', { seed: 'polish-mirror' })
  await deployAll(page)
  expect(await until(page, (i) => i.phase === 'command', 90_000)).toBe(true)
  await page.waitForTimeout(1500)
  // two seats, one army: the second is told apart by name
  const names = await page.evaluate(() => { const s = (window as any).__mallet.useGameStore.getState().state; return [s.players.A.name, s.players.B.name] })
  expect(names[0]).not.toBe(names[1])
  await page.screenshot({ path: `${OUT}/01-mirror-hud.png` })

  // select the Great Cannon (oval base) and light it, zoom the camera onto it
  const cannon = await page.evaluate(() => {
    const s = (window as any).__mallet.useGameStore.getState().state
    const u = Object.values(s.units).find((x: any) => x.player === 'A' && /cannon/i.test(x.name)) as any
    if (!u) return null
    const m = s.models[u.models[0]]
    return { id: u.id, x: m.pos.x, z: m.pos.z }
  })
  expect(cannon).not.toBeNull()
  await page.evaluate((c) => {
    const ui = (window as any).__mallet.useUiStore.getState()
    ui.selectUnit(c!.id)
    ui.hoverUnit(c!.id)
    ;(window as any).__malletCamera?.lookAt(c!.x, c!.z, 9)
  }, cannon)
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/02-cannon-rings.png` })
  expect(problems).toEqual([])
})

test('Magmic Tunnels: the candidate spots are ringed and the hovered one lights up', async ({ page }) => {
  test.setTimeout(420_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await startGame(page, 'fyreslayers', 'cities', { regimentA: 'fyreslayers.ability.magmic-tunnels', seed: 'polish-tunnels' })
  await deployAll(page)
  const reached = await until(page, (i) => i.mine && i.topic === 'abilityMode' && i.redeploy, 120_000)
  console.log('redeploy prompt reached:', reached)
  if (!reached) return
  await page.waitForTimeout(1200)
  const opt = page.locator('[data-testid^="prompt-option-at:"]').first()
  await expect(opt).toBeVisible()
  await opt.hover()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/03-redeploy-hover.png` })
  const lit = await page.evaluate(() => { const u = (window as any).__mallet.useUiStore.getState(); return { spots: u.candidateSpots.length, hovered: u.hoveredSpotId } })
  expect(lit.spots).toBeGreaterThan(0)
  expect(lit.hovered).toMatch(/^at:/)
  expect(problems).toEqual([])
})

test('Fell Ritualist: the extra draw and the put-back prompts have titles and cards', async ({ page }) => {
  test.setTimeout(420_000)
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await startGame(page, 'slaves', 'cities', { enhancementA: 'slaves.enh.fell-ritualist', seed: 'polish-ritualist' })
  await deployAll(page)
  const reached = await until(page, (i) => i.mine && i.topic === 'extraTactic', 200_000)
  console.log('extraTactic prompt reached:', reached)
  if (!reached) return
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/04-extra-tactic.png` })
  await expect(page.getByTestId('prompt')).toContainText(/Draw \d extra battle tactic/)
  await page.locator('[data-testid="prompt-option-draw"]').click()
  expect(await until(page, (i) => i.mine && i.topic === 'bottomTactic', 30_000)).toBe(true)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/05-bottom-tactic.png` })
  await expect(page.getByTestId('prompt')).toContainText('Put a battle tactic back')
  expect(problems).toEqual([])
})
