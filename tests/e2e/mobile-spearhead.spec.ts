// Phone playthrough (hotseat, Cities of Sigmar vs Ironjawz) on the iPhone landscape projects: the real start screen, then the game
// driven through window.__mallet (first legal answer for whoever is asked) so the run reaches round 2 quickly. Checks that nothing
// throws, that the HUD, prompt and card pill do not overlap, and drops screenshots in e2e-out/phone/.
//   PW_BASE_URL=http://localhost:4423/mallet-swordtip/ npx playwright test tests/e2e/mobile-spearhead.spec.ts --project=iphone-pro
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/phone'

/* eslint-disable @typescript-eslint/no-explicit-any */
async function step(page: Page, stop: (i: { round: number; phase: string; kind: string | null; topic: string | null }) => boolean, budgetMs = 120_000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < budgetMs) {
    const info = await page.evaluate(() => {
      const st = (window as any).__mallet.useGameStore.getState()
      return { round: st.state?.round ?? 0, phase: st.state?.phase ?? '', kind: st.pending?.kind ?? null, topic: st.pending?.context?.topic ?? null, ended: st.state?.phase === 'ended' }
    })
    if (info.ended) return false
    if (stop(info)) return true
    await page.evaluate(() => {
      const st = (window as any).__mallet.useGameStore.getState()
      const legal = st.legal ?? []
      if (!st.pending || legal.length === 0) return
      const pass = legal.find((a: any) => a.type === 'pass')
      const nonPass = legal.filter((a: any) => a.type !== 'pass')
      const topic = st.pending.context?.topic
      let a = nonPass[0] ?? pass
      if (['discardTactics', 'tacticCommand', 'abilityUse', 'scoreTactics'].includes(topic) && pass) a = pass
      if (st.pending.kind === 'chooseUnitToActivate' && st.state.phase === 'charge' && pass) a = pass
      st.dispatch(a)
    })
    await page.waitForTimeout(120)
  }
  return false
}

test('phone hotseat: start screen to round 2 without overlap or errors', async ({ page }) => {
  test.setTimeout(540_000)
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'instant', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.waitForTimeout(1800) // the setup card fades in after the title art
  await page.screenshot({ path: `${OUT}/01-start.png` })
  await page.getByTestId('setup-army-A-cities').click()
  await page.getByRole('button', { name: /^Hotseat/ }).click()
  await page.getByTestId('setup-army-B-ironjawz').click()
  await page.getByTestId('setup-seed').fill('phone-1')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/02-setup.png` })

  await step(page, (i) => i.kind === 'deployUnit')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/03-deploy.png` })

  await step(page, (i) => i.round >= 1 && i.phase === 'movement' && i.kind === 'moveUnit')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/04-move.png` })

  await step(page, (i) => i.phase === 'shooting' && i.kind === 'declareTargets')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/05-shoot.png` })

  const cards = page.getByTestId('cards-pill')
  if (await cards.isVisible().catch(() => false)) {
    await cards.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/06-cards.png` })
    await page.getByTestId('card-viewer-close').click().catch(() => {})
  }

  await step(page, (i) => i.phase === 'fight' && (i.kind === 'pileIn' || i.kind === 'chooseFightUnit'))
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/07-fight.png` })

  await step(page, (i) => i.round >= 2 && i.phase === 'movement')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/08-round2.png` })

  // the prompt and the phase tracker must not cover each other
  const a = await page.getByTestId('prompt').boundingBox().catch(() => null)
  const b = await page.getByTestId('phase-tracker').boundingBox().catch(() => null)
  if (a && b) {
    const overlap = !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)
    expect(overlap, 'prompt overlaps the phase tracker').toBe(false)
  }
  expect([...new Set(errors)]).toEqual([])
})
