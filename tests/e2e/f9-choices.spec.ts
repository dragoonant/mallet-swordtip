// F9 choices: every army plays with the NON-default regiment ability and enhancement (picked on the start screen for both seats),
// the choice must show on the Mission panel and in the game state, and the game must reach battle round 1 without a console error.
// Then two longer games where the human plays Gloomspite Gitz and Lumineth Realm-lords up to round 2: every new ability prompt
// (title, hint, options) is recorded and screenshotted into e2e-out/f9/ so its wording and targets can be checked by eye.
//   PW_BASE_URL=http://localhost:4461/ npx playwright test tests/e2e/f9-choices.spec.ts --project=chromium
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'e2e-out/f9'
/* eslint-disable @typescript-eslint/no-explicit-any */
const ARMIES = ['cities', 'ironjawz', 'slaves', 'fyreslayers', 'kruleboyz', 'gloomspite', 'lumineth', 'kharadron'] as const

function watch(page: Page): { problems: string[] } {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/\[bot\] UtilityDecider took/.test(m.text())) problems.push(`console: ${m.text()}`) }) // the bot's own slow-move warning depends on machine load
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`) })
  return { problems }
}

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('swordtip:presentation-settings', JSON.stringify({ animSpeed: 'instant', diceOn: false, ambientOn: false, cinematicCamera: false, lowGraphics: true }))
  })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await expect(page.getByTestId('setup-army-A-kharadron')).toBeVisible()
}

interface Info { phase: string; round: number; kind: string | null; topic: string | null; mine: boolean; ended: boolean }
const snap = (page: Page): Promise<Info> => page.evaluate(() => {
  const st = (window as any).__mallet.useGameStore.getState()
  const p = st.pending
  return { phase: st.state?.phase ?? '', round: st.state?.round ?? 0, kind: p?.kind ?? null, topic: p?.context?.topic ?? null, mine: !!p && p.player === st.humanSeat, ended: st.state?.phase === 'ended' }
})

/** Answers whatever the human is asked. With `useAbilities` an ability prompt is answered with its first real option (so the
 *  prompt chain after it is exercised too); everything else passes, except the first legal move where passing is not allowed. */
async function step(page: Page, useAbilities: boolean): Promise<void> {
  await page.evaluate((useAbilities) => {
    const st = (window as any).__mallet.useGameStore.getState()
    const legal = st.legal ?? []
    if (!st.pending || legal.length === 0) return
    const topic = st.pending.context?.topic
    const pass = legal.find((a: any) => a.type === 'pass')
    const nonPass = legal.filter((a: any) => a.type !== 'pass')
    let a = nonPass[0] ?? pass
    if ((topic === 'discardTactics' || topic === 'tacticCommand' || topic === 'scoreTactics') && pass) a = pass
    if (topic === 'abilityUse' && pass && !useAbilities) a = pass
    if (st.pending.kind === 'chooseUnitToActivate' && st.state.phase !== 'movement' && pass) a = pass
    st.dispatch(a)
  }, useAbilities)
}

async function until(page: Page, stop: (i: Info) => boolean, opts: { budgetMs?: number; useAbilities?: boolean; onPrompt?: (i: Info) => Promise<void> } = {}): Promise<boolean> {
  const t0 = Date.now()
  const { budgetMs = 240_000, useAbilities = false, onPrompt } = opts
  let lastKey = ''
  while (Date.now() - t0 < budgetMs) {
    const i = await snap(page)
    if (i.ended) return false
    if (stop(i)) return true
    if (i.mine) {
      if (onPrompt && i.kind === 'chooseOption') {
        const key = await page.evaluate(() => (window as any).__mallet.useGameStore.getState().pending?.id ?? '')
        if (key !== lastKey) { lastKey = key; await onPrompt(i) }
      }
      await step(page, useAbilities)
    }
    await page.waitForTimeout(150)
  }
  return false
}

async function pickNonDefault(page: Page, seat: 'A' | 'B', kind: 'regiment' | 'enhancement'): Promise<string> {
  const radios = page.locator(`[data-testid^="setup-${kind}-${seat}-"][role="radio"]`)
  const n = await radios.count()
  for (let k = 0; k < n; k++) {
    if ((await radios.nth(k).getAttribute('aria-checked')) === 'false') {
      const testId = (await radios.nth(k).getAttribute('data-testid'))!
      await radios.nth(k).click()
      await expect(radios.nth(k)).toHaveAttribute('aria-checked', 'true')
      return testId.slice(`setup-${kind}-${seat}-`.length)
    }
  }
  throw new Error(`no non-default ${kind} for seat ${seat}`)
}

async function startGame(page: Page, a: string, b: string, seed: string, nonDefault: boolean): Promise<{ regA: string; enhA: string; regB: string; enhB: string }> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await page.getByTestId(`setup-army-A-${a}`).click()
  await page.getByRole('button', { name: /^Bot$/ }).click()
  await page.getByTestId(`setup-army-B-${b}`).click()
  const picks = { regA: '', enhA: '', regB: '', enhB: '' }
  if (nonDefault) {
    picks.regA = await pickNonDefault(page, 'A', 'regiment')
    picks.enhA = await pickNonDefault(page, 'A', 'enhancement')
    picks.regB = await pickNonDefault(page, 'B', 'regiment')
    picks.enhB = await pickNonDefault(page, 'B', 'enhancement')
  }
  await page.getByTestId('setup-seed').fill(seed)
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
  return picks
}

async function deployAll(page: Page): Promise<void> {
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', { budgetMs: 120_000 })).toBe(true)
  await page.waitForTimeout(1200)
  await page.getByTestId('btn-deploy-auto-place').click()
  expect(await until(page, (i) => i.mine && i.kind === 'deployUnit', { budgetMs: 60_000 })).toBe(true)
  await page.getByTestId('btn-deploy-auto-rest').click()
  const done = await until(page, (i) => i.phase !== 'deployment' && i.phase !== 'setup', { budgetMs: 90_000 })
  const left = await page.evaluate(() => (window as any).__mallet.useGameStore.getState().pending?.context?.unitIds ?? null)
  expect(done, `deployment stuck, units left with no spot: ${JSON.stringify(left)}`).toBe(true)
}

// Gloomspite Gitz sit in a 30x5 strip with their big ovals; the auto-placer packs them in one row and can strand a cavalry unit
// (engine issue reported in the F9 ux notes), so their games use a seed whose territory is the roomier one.
const seedFor = (army: string, tag: string): string => (army === 'gloomspite' ? 'a5' : `f9-${tag}-${army}`)

/** Records the open prompt (title block + options) and screenshots it the first time this topic/ability pair is seen. */
function promptRecorder(page: Page, tag: string) {
  const seen = new Set<string>()
  const records: { key: string; round: number; phase: string; text: string; shot: string }[] = []
  const onPrompt = async (i: Info): Promise<void> => {
    const ctx = await page.evaluate(() => {
      const p = (window as any).__mallet.useGameStore.getState().pending
      return { topic: p?.context?.topic ?? '', abilityId: p?.context?.abilityId ?? '', data: p?.context?.data?.kind ?? p?.context?.data?.move ?? p?.context?.data?.place ?? '' }
    })
    // only ability-driven prompts are new here; the shared setup / card prompts are covered by earlier stages
    if (!/^ability/.test(ctx.topic) && ctx.topic !== 'twistPick' && ctx.topic !== 'other' && ctx.topic !== 'contestedObjective') return
    const key = `${ctx.topic}|${ctx.abilityId}|${ctx.data}`
    if (seen.has(key)) return
    seen.add(key)
    const prompt = page.getByTestId('prompt')
    await page.waitForTimeout(300)
    const text = ((await prompt.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
    const shot = `${OUT}/${tag}-${String(records.length + 1).padStart(2, '0')}-${ctx.topic}-${String(ctx.abilityId).split('.').pop() || 'none'}.png`
    await page.screenshot({ path: shot })
    records.push({ key, round: i.round, phase: i.phase, text, shot })
  }
  return { records, onPrompt }
}

for (const [idx, army] of ARMIES.entries()) {
  const opponent = ARMIES[(idx + 3) % ARMIES.length]
  test(`non-default regiment ability and enhancement: ${army} vs ${opponent} reaches battle round 1`, async ({ page }) => {
    test.setTimeout(420_000)
    mkdirSync(OUT, { recursive: true })
    const { problems } = watch(page)
    const picks = await startGame(page, army, opponent, seedFor(army, 'choice'), true)
    expect(picks.regA).toContain(army)

    // the engine took the picks for both seats
    const chosen = await page.evaluate(() => {
      const st = (window as any).__mallet.useGameStore.getState()
      const s = st.state
      const nameOf = (id: string | null) => (id ? s.abilities[id]?.name ?? st.bundle.abilities[id]?.name ?? null : null)
      const pl = (p: 'A' | 'B') => ({ regiment: s.players[p].regimentAbilityId as string | null, regimentName: nameOf(s.players[p].regimentAbilityId), enhancement: s.players[p].enhancementId as string, enhancementName: st.bundle.enhancements[s.players[p].enhancementId]?.name as string })
      return { A: pl('A'), B: pl('B') }
    })
    expect(chosen.A.regiment, 'regiment ability of seat A').toMatch(new RegExp(`${picks.regA.replace(/[.]/g, '\\.')}$`))
    expect(chosen.A.enhancement).toBe(picks.enhA)
    expect(chosen.B.enhancement).toBe(picks.enhB)
    expect(chosen.B.regiment).toMatch(new RegExp(`${picks.regB.replace(/[.]/g, '\\.')}$`))

    await deployAll(page)
    expect(await until(page, (i) => i.round >= 1 && i.phase === 'movement', { budgetMs: 120_000 })).toBe(true)

    // HUD: the Mission panel names each seat's regiment ability and enhancement
    const missionBtn = page.getByTestId('btn-mission')
    if (await missionBtn.isVisible().catch(() => false)) await missionBtn.click()
    const panel = page.getByTestId('mission-panel')
    await expect(panel).toBeVisible()
    for (const seat of ['A', 'B'] as const) {
      await expect(panel, `${seat} regiment shown`).toContainText(chosen[seat].regimentName!)
      await expect(panel, `${seat} enhancement shown`).toContainText(chosen[seat].enhancementName)
    }
    await page.screenshot({ path: `${OUT}/choice-${army}.png` })
    expect(problems).toEqual([])
  })
}

for (const [army, opponent, seed] of [['gloomspite', 'ironjawz', 'a5'], ['lumineth', 'kruleboyz', 'f9-lumi-play']] as const) {
  test(`human plays ${army} to round 2: every ability prompt is recorded`, async ({ page }) => {
    test.setTimeout(900_000)
    mkdirSync(OUT, { recursive: true })
    const { problems } = watch(page)
    await startGame(page, army, opponent, seed, false)
    const rec = promptRecorder(page, army)
    await deployAll(page)
    const reached = await until(page, (i) => i.round >= 2 && i.phase === 'movement', { budgetMs: 700_000, useAbilities: true, onPrompt: rec.onPrompt })
    writeFileSync(`${OUT}/prompts-${army}.json`, JSON.stringify(rec.records, null, 2))
    await page.screenshot({ path: `${OUT}/${army}-round2.png` })
    console.log(`[f9] ${army}: reached round 2 = ${reached}; ${rec.records.length} ability prompts recorded`)
    expect(reached).toBe(true)
    expect(rec.records.length).toBeGreaterThan(0)
    expect(problems).toEqual([])
  })
}
