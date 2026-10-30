// The Ghyran side of Fire and Jade on the client: the start screen's realm picker, a Ghyran game opening on the jade board with
// the five Ghyran objectives, and an Aqshy game still opening on the fire board. No console errors, no failed requests.
//   PW_BASE_URL=http://localhost:5173/ npx playwright test tests/e2e/f9-ghyran.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/f9-ghyran'
/* eslint-disable @typescript-eslint/no-explicit-any */

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
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
}

const board = (page: Page) => page.evaluate(() => {
  const st = (window as any).__mallet.useGameStore.getState()
  return {
    mission: st.state.mission.data.id as string,
    setupSide: st.setup.side as string,
    objectives: Object.values(st.state.objectives).map((o: any) => [Math.round(o.pos.x), Math.round(o.pos.z)]).sort(),
  }
})

async function begin(page: Page, seed: string): Promise<void> {
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId('setup-seed').fill(seed)
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
  await page.waitForTimeout(2500)
}

test('realm picker: Aqshy is the default, Ghyran and Random are offered, Random follows the seed', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  const { problems } = watch(page)
  await open(page)
  await expect(page.getByTestId('setup-realm')).toBeVisible()
  await expect(page.getByTestId('setup-realm-aqshy')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('setup-mission')).toContainText('Aqshy')
  await page.getByTestId('setup-realm-ghyran').click()
  await expect(page.getByTestId('setup-realm-ghyran')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('setup-mission')).toContainText('Ghyran')
  await page.getByTestId('setup-realm-random').click()
  const seen = new Set<string>()
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    await page.getByTestId('setup-seed').fill(seed)
    const note = await page.getByTestId('setup-realm-random-note').innerText()
    seen.add(/plays Ghyran/.test(note) ? 'ghyran' : 'aqshy')
    await expect(page.getByTestId('setup-mission')).toContainText(/plays Ghyran/.test(note) ? 'Ghyran' : 'Aqshy')
  }
  expect(seen).toEqual(new Set(['aqshy', 'ghyran']))
  await page.screenshot({ path: `${OUT}/01-start-realm.png` })
  expect(problems).toEqual([])
})

test('a Ghyran game opens on the Ghyran battleplan, objectives and jade board', async ({ page }) => {
  test.setTimeout(120_000)
  const { problems } = watch(page)
  await open(page)
  await page.getByTestId('setup-realm-ghyran').click()
  await begin(page, 'ghyran-e2e')
  const b = await board(page)
  expect(b.mission).toBe('sph-fire-and-jade-ghyran-horizontal')
  expect(b.setupSide).toBe('ghyran')
  expect(b.objectives).toEqual([[-14, 0], [-7, -7], [0, 0], [14, 0], [7, 7]].sort())
  await page.screenshot({ path: `${OUT}/02-ghyran-board.png` })
  expect(problems).toEqual([])
})

test('an Aqshy game still opens on the fire board', async ({ page }) => {
  test.setTimeout(120_000)
  const { problems } = watch(page)
  await open(page)
  await begin(page, 'aqshy-e2e')
  const b = await board(page)
  expect(b.mission).toBe('sph-fire-and-jade-aqshy-horizontal')
  expect(b.setupSide).toBe('aqshy')
  await page.screenshot({ path: `${OUT}/03-aqshy-board.png` })
  expect(problems).toEqual([])
})
