// F9 phone (iPhone landscape size, Chromium with the compact layout forced): while a deployment prompt is open the unit tags
// step aside, and once the battle starts no unit name tag sits on top of an objective label.
//   PW_BASE_URL=http://localhost:4461/ npx playwright test tests/e2e/f9-phone-labels.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/f9'
/* eslint-disable @typescript-eslint/no-explicit-any */
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

const info = (page: Page) => page.evaluate(() => {
  const st = (window as any).__mallet.useGameStore.getState()
  return { phase: st.state?.phase ?? '', round: st.state?.round ?? 0, kind: st.pending?.kind ?? null, mine: !!st.pending && st.pending.player === st.humanSeat, ended: st.state?.phase === 'ended' }
})

async function drive(page: Page, stop: (i: Awaited<ReturnType<typeof info>>) => boolean, budgetMs = 240_000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < budgetMs) {
    const i = await info(page)
    if (i.ended) return false
    if (stop(i)) return true
    if (i.mine) {
      await page.evaluate(() => {
        const st = (window as any).__mallet.useGameStore.getState()
        const legal = st.legal ?? []
        if (!st.pending || legal.length === 0) return
        const pass = legal.find((a: any) => a.type === 'pass')
        const topic = st.pending.context?.topic
        let a = legal.find((x: any) => x.type !== 'pass') ?? pass
        if (['discardTactics', 'tacticCommand', 'abilityUse', 'scoreTactics'].includes(topic) && pass) a = pass
        st.dispatch(a)
      })
    }
    await page.waitForTimeout(150)
  }
  return false
}

/** Name tags (visible ones) whose box overlaps an objective label's box. */
const tagsOnObjectives = (page: Page) => page.evaluate(() => {
  const objs = Array.from(document.querySelectorAll('[data-testid^="objective-label-"]')).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)
  const clash: string[] = []
  document.querySelectorAll('[data-testid^="unit-label-"]').forEach((t) => {
    const r = t.getBoundingClientRect()
    let el: HTMLElement | null = t as HTMLElement
    let op = 1
    for (let i = 0; i < 5 && el; i++, el = el.parentElement) op = Math.min(op, Number(getComputedStyle(el).opacity))
    if (r.width === 0 || op < 0.5) return
    for (const o of objs) if (r.left < o.right - 2 && o.left + 2 < r.right && r.top < o.bottom - 2 && o.top + 2 < r.bottom) clash.push(t.getAttribute('data-testid')!)
  })
  return clash
})

test('phone: tags hide while placing a unit and keep clear of objective labels afterwards', async ({ page }) => {
  test.setTimeout(420_000)
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/\[bot\] UtilityDecider took/.test(m.text())) errors.push(m.text().slice(0, 200)) })
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'instant', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto('/?ff=compact')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByTestId('setup-army-A-fyreslayers').click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId('setup-army-B-kruleboyz').click()
  await page.getByTestId('setup-seed').fill('f9-phone')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)

  // deploy one unit, then look at the board while the next placement prompt is open
  expect(await drive(page, (i) => i.mine && i.kind === 'deployUnit', 120_000)).toBe(true)
  await page.waitForTimeout(1200)
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await drive(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
  await page.waitForTimeout(1500)
  const visibleTags = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="unit-label-"]')).filter((t) => {
    let el: HTMLElement | null = t as HTMLElement
    let op = 1
    for (let i = 0; i < 5 && el; i++, el = el.parentElement) op = Math.min(op, Number(getComputedStyle(el).opacity))
    return op > 0.1
  }).length)
  await page.screenshot({ path: `${OUT}/phone-deploy-prompt.png` })
  expect(visibleTags, 'unit name tags are hidden while a deployment placement prompt is open').toBe(0)

  // pick a unit to place: the camera comes in on the zone, the tags stay out of the way
  await page.locator('[data-testid="prompt"] button:not([data-testid])').first().click()
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/phone-deploy-picked.png` })

  // the rest of the army goes down through the store (first legal spot), as the other phone spec does
  expect(await drive(page, (i) => i.round >= 1 && i.phase === 'movement', 150_000)).toBe(true)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/phone-round1.png` })
  expect(await tagsOnObjectives(page), 'a unit tag overlaps an objective label').toEqual([])
  expect(errors).toEqual([])
})
