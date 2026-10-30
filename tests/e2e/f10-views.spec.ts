// QA helper for F10 figures: top-down and side gallery views of one army (or several, comma separated).
//   FIG=kruleboyz VIEW=top|side PW_BASE_URL=http://localhost:4471/ npx playwright test tests/e2e/f10-views.spec.ts --project=chromium
import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/f10/figures/views'
test('gallery views', async ({ page }) => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  const armies = (process.env.FIG ?? 'kruleboyz').split(';')
  const views = (process.env.VIEW ?? 'top').split(';')
  for (const f of armies) {
    for (const v of views) {
      const [elev, az] = v === 'top' ? [89, 0] : v === 'side' ? [8, 90] : v === 'front' ? [10, 0] : [20, 0]
      const paint = process.env.PAINT ? `&${process.env.PAINT}` : ''
      await page.goto(`/?gallery&faction=${f}&elev=${elev}&az=${az}${paint}`)
      await page.waitForTimeout(5000)
      await page.screenshot({ path: `${OUT}/${f.replace(',', '+')}-${v}${process.env.PAINT ? '-painted' : ''}.png`, clip: { x: 0, y: 330, width: 1920, height: 420 } })
    }
  }
})
