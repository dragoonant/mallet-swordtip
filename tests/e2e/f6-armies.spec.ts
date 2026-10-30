import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  centroid, clearToast, clickCanvasAt, clickFirstOption, clickPass, makeCam, project, promptButton,
  snap, tryBoardPlacement, type Cam, type Snap, type V2,
} from './helpers'

// F6 QA playthrough: Slaves to Darkness vs Fyreslayers and Fyreslayers vs Cities against the bot, driven through the
// real UI (window.__mallet is only read). Deployment uses real board clicks; movement and shooting spend one real board
// click per turn; every other decision takes the first non-pass option or Pass. Reaches the end screen after round 4.
// Screenshots go to e2e-out/f6/; the new armies' ability names seen in prompts are logged.

const W = 1600
const H = 900
const OUT = 'e2e-out/f6'
const GAME_BUDGET_MS = Number(process.env.E2E_BUDGET_MIN ?? 9) * 60_000
const STALL_LIMIT_MS = 20_000
const POLL_MS = 100

async function configureSettings(page: Page): Promise<void> {
  await page.getByTestId('btn-settings').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  await page.getByTestId('settings-speed-instant').click()
  const diceOn = page.getByTestId('settings-dice-on')
  if (await diceOn.isChecked()) await diceOn.click()
  const ambientOn = page.getByTestId('settings-ambient-on')
  if (await ambientOn.isChecked()) await ambientOn.click()
  const muteAll = page.getByTestId('settings-mute')
  if (!(await muteAll.isChecked())) await muteAll.click()
  await page.getByTestId('btn-settings').click()
}

async function shot(page: Page, name: string): Promise<string> {
  const path = `${OUT}/${name}.png`
  await page.evaluate(() => {
    const c = (window as unknown as { __malletCamera?: { get(): { x: number; z: number; distance: number }; lookAt(x: number, z: number, d: number): void } }).__malletCamera
    if (c) { const g = c.get(); c.lookAt(g.x, g.z, g.distance) }
    return new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path })
  return path
}

const escapeRe = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`)

// The Spearhead strips are 5" deep, so deployment order and spacing matter: place the widest units first and pack
// from the left edge, anchors every 2" across the strip on three rows.
function packedCandidates(zone: V2[]): V2[] {
  const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const midZ = (minZ + maxZ) / 2
  const pts: V2[] = []
  for (let x = minX + 1.5; x <= maxX - 1.5; x += 2) for (const dz of [0, 1.0, -1.0]) pts.push({ x, z: midZ + dz })
  return pts
}

async function handleDeploy(page: Page, s: Snap, cam: Cam): Promise<void> {
  const p = s.pending!
  const unitIds: string[] = [...p.context.unitIds]
  const modelCount = (id: string) => s.units.find((u) => u.id === id)?.models.length ?? 1
  unitIds.sort((a, b) => modelCount(b) - modelCount(a))
  const zone: V2[] = p.context.zone
  const points = packedCandidates(zone)
  for (const uid of unitIds) {
    const name = s.units.find((u) => u.id === uid)?.name ?? uid
    const chip = await promptButton(page, new RegExp(`^${escapeRe(name)}$`))
    if (!chip) continue
    await chip.click()
    if (await tryBoardPlacement(page, s, points, cam, W, H, name, { retryFormations: true })) return
  }
  await clickPass(page)
}

interface TurnState { key: string; usedMove: boolean; usedShot: boolean }

async function handlePlay(page: Page, s: Snap, cam: Cam, turn: TurnState): Promise<{ moved: boolean; shot: boolean }> {
  const p = s.pending!
  const enemy = s.units.filter((u) => u.player !== p.player && u.loc === 'board' && u.models.length)

  if (p.kind === 'moveUnit' && s.phase === 'movement' && !turn.usedMove) {
    const u = s.units.find((x) => x.id === p.context.unitId)
    if (u && enemy.length) {
      const a = centroid(u.models)
      const targets = enemy.map((e) => centroid(e.models)).sort((q, r) => Math.hypot(q.x - a.x, q.z - a.z) - Math.hypot(r.x - a.x, r.z - a.z))
      const t = targets[0]
      const base = Math.atan2(t.z - a.z, t.x - a.x)
      const max = p.constraints?.maxDistance ?? 6
      const pts: V2[] = []
      for (const frac of [0.7, 0.4]) for (const da of [0, 0.5, -0.5, 1.0, -1.0]) {
        const d = Math.max(1, max * frac)
        pts.push({ x: a.x + Math.cos(base + da) * d, z: a.z + Math.sin(base + da) * d })
      }
      if (await tryBoardPlacement(page, s, pts, cam, W, H, `move ${u.name}`)) return { moved: true, shot: false }
    }
  }
  if (p.kind === 'declareTargets' && !turn.usedShot) {
    const ts = new Set<string>()
    for (const w of p.context.weapons ?? []) for (const t of w.legalTargets) ts.add(t)
    for (const tid of ts) {
      const tu = s.units.find((x) => x.id === tid)
      for (const m of (tu?.models ?? []).slice(0, 3)) {
        await clearToast(page)
        if (!(await clickCanvasAt(page, project({ x: m.x, y: 0.6, z: m.z }, cam, W, H), W, H))) continue
        const opened = await page.getByTestId('weapon-panel').waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false)
        const fire = page.getByTestId('btn-fire')
        if (opened && (await fire.isEnabled().catch(() => false))) {
          await fire.click()
          await page.waitForTimeout(150)
          if ((await snap(page)).pending?.id !== p.id) return { moved: false, shot: true }
        }
      }
    }
  }

  switch (p.kind) {
    case 'declareTargets': {
      const nothing = page.getByTestId('btn-fire-nothing')
      if (await nothing.isVisible().catch(() => false)) { await nothing.click(); return { moved: false, shot: false } }
      const b = await promptButton(page, /^Target /)
      if (b) { await b.click(); return { moved: false, shot: false } }
      if (!(await clickFirstOption(page, false))) await clickPass(page)
      return { moved: false, shot: false }
    }
    default:
      if (!(await clickFirstOption(page))) await clickPass(page)
      return { moved: false, shot: false }
  }
}

async function playGame(page: Page, opts: { opponent: 'hotseat' | 'bot'; prefix: string; stopAtRound?: number; human: string; other: string }): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: W, height: H })
  const consoleErrors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`))
  const shots: string[] = []

  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  const { human, other } = opts
  await page.getByTestId(`setup-army-A-${human}`).click()
  await page.getByRole('button', { name: opts.opponent === 'hotseat' ? /^Hotseat/ : /^Bot$/ }).click()
  await page.getByTestId(`setup-army-B-${other}`).click()
  await page.getByTestId('setup-seed').fill('swordtip-f6-1')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${opts.prefix}-01-start-screen.png` })
  shots.push(`${OUT}/${opts.prefix}-01-start-screen.png`)
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet) // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.waitForTimeout(400)
  await configureSettings(page)

  const cam = makeCam()
  const m = { deployed: false, moves: 0, shots: 0, stuck: [] as string[], rounds: new Set<number>(), deployShot: false, midShot: false, deployedShot: false }
  const start = Date.now()
  let lastPendingId = ''
  let lastChangeAt = start
  let turn: TurnState = { key: '', usedMove: false, usedShot: false }
  let reachedEnd = false
  let deployCount = 0
  const qaSeen = new Set<string>()
  const abilityHits = new Map<string, string>()
  const KEYWORDS = /Oaths? of Darkness|Rage of Arkhar|Fearless Invaders|Bloodthirsty Blade|Godshadow|Champion of Raids|Fell Ritualist|Awaken the Runes|Magmic Tunnels|Fyresteel Throwing Axes|Too Stubborn|Horn of Grimnir|Spirit of Grimnir|Powerful Presence|Rune of /i

  while (Date.now() - start < GAME_BUDGET_MS) {
    const s = await snap(page)
    const now = Date.now()
    if (s.result || s.phase === 'ended') { reachedEnd = true; break }
    if (opts.stopAtRound && s.round >= opts.stopAtRound) break
    if (!s.pending) { await page.waitForTimeout(POLL_MS); continue }
    if (typeof s.round === 'number') m.rounds.add(s.round)

    const turnKey = `${s.round}:${s.active}`
    if (turnKey !== turn.key) turn = { key: turnKey, usedMove: false, usedShot: false }

    if (s.pending.id !== lastPendingId) { lastPendingId = s.pending.id; lastChangeAt = now }
    else if (now - lastChangeAt > STALL_LIMIT_MS) {
      const promptVisible = await page.getByTestId('prompt').isVisible().catch(() => false)
      if (promptVisible) lastChangeAt = now // waiting on our own next click
      else { m.stuck.push(`decision ${s.pending.id} (${s.pending.kind}, ${s.pending.player}) no progress for ${STALL_LIMIT_MS}ms, prompt hidden`); break }
    }

    if (s.pending.player === s.humanSeat) {
      const txt = (await page.getByTestId('prompt').innerText({ timeout: 500 }).catch(() => '')).replace(/\s+/g, ' ')
      const found = txt.match(new RegExp(KEYWORDS.source, 'gi')) ?? []
      for (const f of found) {
        const k = f.toLowerCase()
        if (!abilityHits.has(k)) {
          abilityHits.set(k, `${s.pending.kind}/${s.phase}: ${txt.slice(0, 160)}`)
          mkdirSync(`${OUT}/abilities`, { recursive: true })
          await shot(page, `abilities/${opts.prefix}-${k.replace(/[^a-z]+/g, '-')}`)
        }
      }
    }
    if (process.env.QA_SHOTS && s.pending.player === s.humanSeat) {
      const key = `${s.pending.kind}-${s.phase}-${s.pending.context?.topic ?? ''}`
      if (!qaSeen.has(key) && qaSeen.size < 40) { qaSeen.add(key); mkdirSync(`${OUT}/qa`, { recursive: true }); await shot(page, `qa/${opts.prefix}-r${s.round}-${key}`) }
    }
    if (s.pending.kind === 'deployUnit') {
      deployCount++
      if (!m.deployShot && deployCount === 2) { m.deployShot = true; shots.push(await shot(page, `${opts.prefix}-02-deployment`)) }
      await handleDeploy(page, s, cam)
    } else {
      if (!m.deployed && s.phase !== 'setup' && s.phase !== 'deployment') {
        m.deployed = true
        shots.push(await shot(page, `${opts.prefix}-03-deployed-battle-start`))
      }
      if (!m.midShot && s.round === 2 && s.phase === 'movement' && s.pending.player === s.humanSeat) { m.midShot = true; shots.push(await shot(page, `${opts.prefix}-04-round2`)) }
      const r = await handlePlay(page, s, cam, turn)
      if (r.moved) { turn.usedMove = true; m.moves++ }
      if (r.shot) { turn.usedShot = true; m.shots++ }
    }
  }

  const final = await snap(page)
  const cineShown = await page.getByTestId('end-cinematic').isVisible().catch(() => false)
  if (cineShown) await page.getByTestId('end-cinematic-skip').click().catch(() => {})
  await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${opts.prefix}-05-end-screen.png` })
  shots.push(`${OUT}/${opts.prefix}-05-end-screen.png`)

  const summary = {
    elapsedS: Math.round((Date.now() - start) / 1000), reachedEnd, final: { round: final.round, phase: final.phase, result: final.result },
    milestones: { ...m, rounds: [...m.rounds] }, abilityHits: Object.fromEntries(abilityHits), shots, consoleErrors: [...new Set(consoleErrors)].slice(0, 30),
  }
  writeFileSync(`${OUT}/${opts.prefix}-log.json`, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))

  expect(m.stuck, 'no decision stalled without a visible prompt').toEqual([])
  expect(consoleErrors, 'no console errors').toEqual([])
  expect(m.deployed, 'deployment finished').toBe(true)
  if (opts.stopAtRound) {
    expect(final.round).toBeGreaterThanOrEqual(opts.stopAtRound)
    return
  }
  expect(reachedEnd, 'game reached a GameResult').toBe(true)
  expect(final.round, 'the battle ran to round 4').toBe(4)
  await expect(page.getByTestId('end-screen')).toBeVisible()
}

test('bot: Slaves to Darkness (seat A) vs the Fyreslayers bot plays to the end screen', async ({ page }) => {
  test.setTimeout(GAME_BUDGET_MS + 120_000)
  await playGame(page, { opponent: 'bot', prefix: 'slaves-v-fyre', human: 'slaves', other: 'fyreslayers' })
})

test('bot: Fyreslayers (seat A) vs the Cities bot plays to the end screen', async ({ page }) => {
  test.setTimeout(GAME_BUDGET_MS + 120_000)
  await playGame(page, { opponent: 'bot', prefix: 'fyre-v-cities', human: 'fyreslayers', other: 'cities' })
})
