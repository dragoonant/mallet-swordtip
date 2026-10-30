// Screenshots of the Spearhead card UI (twist reveal, hand fan, card viewer, card prompts) on desktop and phone.
// Drives the game through window.__mallet (first legal answer for the human seat), animations set to instant.
//   PW_BASE_URL=http://localhost:4417/mallet-swordtip/ npx playwright test tests/e2e/cards-shots.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/cards'

type Store = { getState(): { state: any; pending: any; legal: any[] | null; humanSeat: string; botSeat: string | null; dispatch(a: unknown): void } } // eslint-disable-line @typescript-eslint/no-explicit-any

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'fast', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByTestId('setup-army-A-cities').click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId('setup-army-B-ironjawz').click()
  await page.getByTestId('setup-seed').fill('cards-shots-3')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet) // eslint-disable-line @typescript-eslint/no-explicit-any
}

// answer the human's decisions with a sensible default until `stop` says so; returns the pending topic it stopped on
async function drive(page: Page, stop: (info: { round: number; phase: string; topic: string | null; kind: string | null; mine: boolean; hand: number }) => boolean, budgetMs = 120_000): Promise<string | null> {
  const t0 = Date.now()
  while (Date.now() - t0 < budgetMs) {
    const info = await page.evaluate(() => {
      const store = (window as any).__mallet.useGameStore as Store // eslint-disable-line @typescript-eslint/no-explicit-any
      const st = store.getState()
      const p = st.pending
      const seat = st.humanSeat
      return {
        round: st.state?.round ?? 0, phase: st.state?.phase ?? '', topic: p?.context?.topic ?? null, kind: p?.kind ?? null,
        mine: !!p && p.player === seat, hand: st.state?.cards?.tactics?.[seat]?.hand?.length ?? 0, ended: st.state?.phase === 'ended',
      }
    })
    if (info.ended) return 'ended'
    if (stop(info)) return info.topic ?? info.kind
    if (info.mine) {
      await page.evaluate(() => {
        const store = (window as any).__mallet.useGameStore as Store // eslint-disable-line @typescript-eslint/no-explicit-any
        const st = store.getState()
        const legal = st.legal ?? []
        if (!st.pending || legal.length === 0) return
        const topic = st.pending.context?.topic
        const pass = legal.find((a: any) => a.type === 'pass') // eslint-disable-line @typescript-eslint/no-explicit-any
        const nonPass = legal.filter((a: any) => a.type !== 'pass') // eslint-disable-line @typescript-eslint/no-explicit-any
        let a = nonPass[0] ?? pass
        if ((topic === 'discardTactics' || topic === 'tacticCommand' || topic === 'abilityUse') && pass) a = pass
        if (st.pending.kind === 'chooseUnitToActivate' && st.state.phase !== 'movement' && pass) a = pass
        st.dispatch(a)
      })
    }
    await page.waitForTimeout(150)
  }
  return null
}

test('cards UI screenshots (desktop + phone)', async ({ page, browser }) => {
  test.setTimeout(400_000)
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await start(page)

  // the twist reveal at the start of round 1
  await drive(page, (i) => i.round >= 1 && i.phase !== 'deployment' && i.phase !== 'setup')
  const banner = page.getByTestId('phase-banner')
  for (let k = 0; k < 40; k++) {
    if (await banner.isVisible().catch(() => false) && /Twist/.test(await banner.innerText().catch(() => ''))) break
    await page.waitForTimeout(100)
  }
  await page.screenshot({ path: `${OUT}/01-twist-reveal.png` })

  await drive(page, (i) => i.mine && i.hand > 0 && i.phase === 'command')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/02-hand-fan.png` })
  await page.getByTestId('hand-card-1').hover()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/03-hand-hover.png` })
  await page.getByTestId('hand-card-1').click()
  await expect(page.getByTestId('card-viewer')).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/04-card-viewer.png` })
  await page.getByTestId('card-viewer-close').click()

  // a card prompt of our own (score / command / discard)
  const topic = await drive(page, (i) => i.mine && (i.topic === 'scoreTactics' || i.topic === 'tacticCommand' || i.topic === 'discardTactics' || i.topic === 'twistPick'), 240_000)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/05-card-prompt-${topic}.png` })
  if (await page.getByTestId('hand-card-0').isVisible().catch(() => false)) {
    await page.getByTestId('hand-card-0').click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/06-card-prompt-viewer.png` })
    await page.getByTestId('card-viewer-close').click().catch(() => {})
  }

  // phone: a fresh game in a Pixel 7 landscape context (touch + phone user agent switch the compact layout on)
  const { devices } = await import('@playwright/test')
  const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] })
  const phone = await ctx.newPage()
  phone.on('pageerror', (e) => errors.push(e.message))
  await start(phone)
  await drive(phone, (i) => i.mine && i.hand > 0 && i.phase === 'command')
  await phone.waitForTimeout(1000)
  await phone.screenshot({ path: `${OUT}/07-phone.png` })
  if (await phone.getByTestId('cards-pill').isVisible().catch(() => false)) {
    await phone.getByTestId('cards-pill').click()
    await phone.waitForTimeout(400)
    await phone.screenshot({ path: `${OUT}/08-phone-viewer.png` })
    await phone.getByTestId('card-viewer-close').click()
  }
  await ctx.close()
  void browser
  expect(errors).toEqual([])
})
