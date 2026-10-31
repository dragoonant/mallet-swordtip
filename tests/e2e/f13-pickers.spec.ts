// F13 pickers: the start screen's regiment-ability and enhancement pickers are never used by the scripted human. For every army
// as seat A: pick the NON-default regiment ability and enhancement (both radiogroups), start a game vs a bot, and check the
// picks reached the engine and show on the Mission panel once deployment begins; no console errors. Screenshots of three armies
// plus one phone-landscape run go to e2e-out/f13/.
//   PW_BASE_URL=http://localhost:4481/mallet-swordtip/ npx playwright test tests/e2e/f13-pickers.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/f13'
/* eslint-disable @typescript-eslint/no-explicit-any */
const ARMIES = ['cities', 'ironjawz', 'slaves', 'fyreslayers', 'kruleboyz', 'gloomspite', 'lumineth', 'kharadron', 'stormcast', 'skaven', 'seraphon', 'soulblight'] as const
const SHOT = new Set<string>(['cities', 'skaven', 'lumineth'])

function watch(page: Page): { problems: string[] } {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/\[bot\] UtilityDecider took/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`) })
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`) })
  return { problems }
}

async function pickNonDefault(page: Page, kind: 'regiment' | 'enhancement'): Promise<string> {
  const group = page.getByTestId(`setup-${kind}-A`)
  await expect(group).toBeVisible()
  const radios = page.locator(`[data-testid^="setup-${kind}-A-"][role="radio"]`)
  const n = await radios.count()
  expect(n, `${kind} options`).toBeGreaterThanOrEqual(2)
  for (let k = 0; k < n; k++) {
    if ((await radios.nth(k).getAttribute('aria-checked')) === 'false') {
      const testId = (await radios.nth(k).getAttribute('data-testid'))!
      await radios.nth(k).scrollIntoViewIfNeeded()
      await radios.nth(k).click()
      await expect(radios.nth(k)).toHaveAttribute('aria-checked', 'true')
      // exactly one radio is checked afterwards
      await expect(page.locator(`[data-testid^="setup-${kind}-A-"][aria-checked="true"]`)).toHaveCount(1)
      return testId.slice(`setup-${kind}-A-`.length)
    }
  }
  throw new Error(`no non-default ${kind}`)
}

async function runArmy(page: Page, army: string, opponent: string, shot: string | null, path = '/'): Promise<void> {
  const { problems } = watch(page)
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'instant', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto(path)
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByTestId(`setup-army-A-${army}`).click()
  const regiment = await pickNonDefault(page, 'regiment')
  const enhancement = await pickNonDefault(page, 'enhancement')
  expect(regiment).toContain(army)
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId(`setup-army-B-${opponent}`).click()
  // the picks survive choosing the opponent
  await expect(page.getByTestId(`setup-regiment-A-${regiment}`)).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId(`setup-enhancement-A-${enhancement}`)).toHaveAttribute('aria-checked', 'true')
  const names = await page.evaluate(([r, e]) => ({
    regiment: document.querySelector(`[data-testid="setup-regiment-A-${r}"]`)?.textContent ?? '',
    enhancement: document.querySelector(`[data-testid="setup-enhancement-A-${e}"]`)?.textContent ?? '',
  }), [regiment, enhancement])
  if (shot) await page.screenshot({ path: `${OUT}/${shot}-1-start.png` })
  await page.getByTestId('setup-seed').fill(`f13-${army}`)
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
  await page.waitForFunction(() => {
    const st = (window as any).__mallet.useGameStore.getState()
    return st.state && st.state.phase !== 'setup' || !!st.pending
  }, null, { timeout: 60_000 })

  const chosen = await page.evaluate(() => {
    const st = (window as any).__mallet.useGameStore.getState()
    const s = st.state
    const nameOf = (id: string | null) => (id ? s.abilities[id]?.name ?? st.bundle.abilities[id]?.name ?? null : null)
    return {
      regiment: s.players.A.regimentAbilityId as string | null,
      regimentName: nameOf(s.players.A.regimentAbilityId) as string | null,
      enhancement: s.players.A.enhancementId as string,
      enhancementName: st.bundle.enhancements[s.players.A.enhancementId]?.name as string,
      phase: s.phase as string,
    }
  })
  expect(chosen.regiment, 'engine regiment ability').toMatch(new RegExp(`${regiment.replace(/\./g, '\\.')}$`))
  expect(chosen.enhancement, 'engine enhancement').toBe(enhancement)
  // the picker card's text carries the same names the HUD will show
  expect(names.enhancement).toContain(chosen.enhancementName)

  // answer the setup prompts (attacker/defender, army options, terrain, ...) with their first legal move until the human is asked to deploy
  const t0 = Date.now()
  let deploying = false
  while (Date.now() - t0 < 90_000 && !deploying) {
    deploying = await page.evaluate(() => {
      const st = (window as any).__mallet.useGameStore.getState()
      if (st.pending?.kind === 'deployUnit' && st.pending.player === st.humanSeat) return true
      if (st.pending && st.pending.player === st.humanSeat && (st.legal ?? []).length > 0) st.dispatch(st.legal.find((a: any) => a.type !== 'pass') ?? st.legal[0])
      return false
    })
    if (!deploying) await page.waitForTimeout(150)
  }
  expect(deploying, 'reached the human deployment prompt').toBe(true)
  const stillA = await page.evaluate(() => { const p = (window as any).__mallet.useGameStore.getState().state.players.A; return [p.regimentAbilityId, p.enhancementId] })
  expect(stillA, 'picks unchanged once deployment begins').toEqual([chosen.regiment, chosen.enhancement])

  // the Mission panel lists both picks for seat A (on a phone it sits in the menu drawer)
  if (!(await page.getByTestId('btn-mission').isVisible().catch(() => false))) await page.getByRole('button', { name: 'Menu' }).click()
  const missionBtn = page.getByTestId('btn-mission')
  if (await missionBtn.isVisible().catch(() => false)) await missionBtn.click()
  const panel = page.getByTestId('mission-panel')
  await expect(panel).toBeVisible({ timeout: 30_000 })
  await expect(panel, 'regiment ability on Mission panel').toContainText(chosen.regimentName!)
  await expect(panel, 'enhancement on Mission panel').toContainText(chosen.enhancementName)
  await page.waitForTimeout(800) // let the panel finish sliding in
  if (shot) await page.screenshot({ path: `${OUT}/${shot}-2-deployment.png` })
  expect(problems).toEqual([])
}

test.beforeAll(() => { mkdirSync(OUT, { recursive: true }) })

for (const [idx, army] of ARMIES.entries()) {
  const opponent = ARMIES[(idx + 5) % ARMIES.length]
  test(`PICK-001 non-default regiment ability and enhancement for ${army} show once deployment begins`, async ({ page }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await runArmy(page, army, opponent, SHOT.has(army) ? army : null)
  })
}

test.describe('phone landscape', () => {
  test.use({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true })
  test('PICK-002 phone: skaven non-default picks reach the Mission panel', async ({ page }) => {
    test.setTimeout(150_000)
    await runArmy(page, 'skaven', 'seraphon', 'phone-skaven', '/?ff=compact')
  })
})
