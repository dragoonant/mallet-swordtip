// F11 polish: unit tags ride the drawn sculpt's height (Gloomspite monster mounts), tags keep clear of the HUD in close views,
// and on a phone in landscape the tags step aside while a deployment prompt is open.
//   PW_BASE_URL=http://localhost:4461/ npx playwright test tests/e2e/f11-labels.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-out/f11'
/* eslint-disable @typescript-eslint/no-explicit-any */

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

async function startGame(page: Page, army: string, enemy: string, seed: string, url = '/') {
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'instant', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto(url)
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByTestId(`setup-army-A-${army}`).click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId(`setup-army-B-${enemy}`).click()
  await page.getByTestId('setup-seed').fill(seed)
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
}

test('desktop: tags sit just above the drawn Gloomspite mounts and clear of the HUD in a close view', async ({ page }) => {
  test.setTimeout(300_000)
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await startGame(page, 'gloomspite', 'kruleboyz', 'f11-glo')
  expect(await drive(page, (i) => i.round >= 1 && i.phase === 'movement', 200_000)).toBe(true)
  await page.waitForTimeout(2500)
  // the Snarlboss unit's centre
  const target = await page.evaluate(() => {
    const st = (window as any).__mallet.useGameStore.getState().state
    const u = Object.values(st.units as Record<string, any>).find((x: any) => x.player === 'A' && x.location === 'board' && /Snarlboss|Wolfgit|Snarlpack/.test(x.name)) as any
    const ms = u.models.map((id: string) => st.models[id])
    return { id: u.id, name: u.name, x: ms.reduce((s: number, m: any) => s + m.pos.x, 0) / ms.length, z: ms.reduce((s: number, m: any) => s + m.pos.z, 0) / ms.length, engineH: Math.max(...ms.map((m: any) => m.height)) }
  })
  await page.evaluate((t) => (window as any).__malletCamera.lookAt(t.x, t.z, 9), target)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/gloomspite-label-closeup.png` })
  const gap = await page.evaluate((t) => {
    const lab = document.querySelector(`[data-testid="unit-label-${t.id}"]`)!.getBoundingClientRect()
    const head = (window as any).__malletProject(t.x, 2.2, t.z)
    return { labelBottom: lab.bottom, headY: head.y, labelCx: (lab.left + lab.right) / 2, headX: head.x }
  }, target)
  // the tag's foot is a short hop above the drawn head (a 2.2" mark), not the engine's 3.5" rules height plus padding
  expect(gap.labelBottom, 'tag floats near the drawn head').toBeGreaterThan(gap.headY - 140)
  expect(gap.labelBottom, 'tag does not sink into the model').toBeLessThan(gap.headY + 10)
  expect(errors).toEqual([])
})

test('desktop: a tag pushed under the top bar fades out and returns when the camera moves it clear', async ({ page }) => {
  test.setTimeout(300_000)
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await startGame(page, 'gloomspite', 'kruleboyz', 'f11-glo')
  expect(await drive(page, (i) => i.round >= 1 && i.phase === 'movement', 200_000)).toBe(true)
  await page.waitForTimeout(2000)
  const t = await page.evaluate(() => {
    const st = (window as any).__mallet.useGameStore.getState().state
    const u = Object.values(st.units as Record<string, any>).find((x: any) => x.player === 'A' && x.location === 'board') as any
    const ms = u.models.map((id: string) => st.models[id])
    return { id: u.id, x: ms.reduce((s: number, m: any) => s + m.pos.x, 0) / ms.length, z: ms.reduce((s: number, m: any) => s + m.pos.z, 0) / ms.length }
  })
  const opacityOf = (id: string) => page.evaluate((uid) => {
    const el = document.querySelector(`[data-testid="unit-label-${uid}"]`) as HTMLElement | null
    if (!el) return -1
    let o = 1
    for (let e: HTMLElement | null = el, i = 0; e && i < 6; e = e.parentElement, i++) o = Math.min(o, Number(getComputedStyle(e).opacity))
    return o
  }, id)
  // slide the view until the unit's tag sits under the top bar (centred on the phase tracker)
  let under: { top: number; bottom: number; left: number; right: number } | null = null
  for (const dz of [4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    await page.evaluate((p) => (window as any).__malletCamera.lookAt(p.x, p.z + p.dz, 14), { ...t, dz })
    await page.waitForTimeout(700)
    const r = await page.evaluate((uid) => {
      const q = document.querySelector(`[data-testid="unit-label-${uid}"]`)!.getBoundingClientRect()
      return { top: q.top, bottom: q.bottom, left: q.left, right: q.right }
    }, t.id)
    if (r.top > 10 && r.bottom < 95 && r.left > 220 && r.right < 920) { under = r; break }
  }
  await page.screenshot({ path: `${OUT}/desktop-tag-under-hud.png` })
  expect(under, 'found a camera that puts the tag under the top bar').not.toBeNull()
  await page.waitForTimeout(600)
  expect(await opacityOf(t.id), 'tag under the top bar is faded out').toBeLessThan(0.1)
  await page.evaluate((p) => (window as any).__malletCamera.lookAt(p.x, p.z, 14), t)
  await page.waitForTimeout(1500)
  expect(await opacityOf(t.id), 'tag in the clear is visible').toBeGreaterThan(0.9)
})

test.describe('phone landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

  test('tags step aside while a deployment prompt is open, the objective labels read clearly', async ({ page }) => {
    test.setTimeout(300_000)
    mkdirSync(OUT, { recursive: true })
    await startGame(page, 'gloomspite', 'kruleboyz', 'f11-phone', '/?ff=compact')
    expect(await drive(page, (i) => i.mine && i.kind === 'deployUnit', 120_000)).toBe(true)
    await page.waitForTimeout(1200)
    await page.getByTestId('btn-deploy-auto-place').click()
    expect(await drive(page, (i) => i.mine && i.kind === 'deployUnit', 60_000)).toBe(true)
    await page.waitForTimeout(1500)
    const visible = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="unit-label-"]')).filter((t) => {
      let el: HTMLElement | null = t as HTMLElement
      let op = 1
      for (let i = 0; i < 6 && el; i++, el = el.parentElement) op = Math.min(op, Number(getComputedStyle(el).opacity))
      return op > 0.1
    }).length)
    await page.screenshot({ path: `${OUT}/phone-deploy-prompt.png` })
    expect(await visible(), 'unit tags hidden while the deploy prompt is open').toBe(0)
    await page.locator('[data-testid="prompt"] button:not([data-testid])').first().click()
    await page.waitForTimeout(1800)
    await page.screenshot({ path: `${OUT}/phone-deploy-picked.png` })
    expect(await visible(), 'unit tags stay hidden while a unit is being placed').toBe(0)
  })
})
