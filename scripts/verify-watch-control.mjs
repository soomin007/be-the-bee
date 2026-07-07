// 관전 시작/멈춤 + AI 성향 점검(2026-06-30 개편: 관전 진입은 새 게임 마법사 경유, 시작하면 바로 진행):
//  1) 마법사에서 관전 시작 → 수가 진행된다.
//  2) ⏸ 멈춤 → 더 진행되지 않는다. ▶ 다시 시작 → 재개.
//  3) 노랑/갈색 성향 셀렉트 존재.
import { chromium } from 'playwright'
import { prepPage, openWizard, wizardPick } from './lib/boot.mjs'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await prepPage(page)
await page.waitForSelector('svg.board')

const pieces = () => page.locator('svg.board circle.piece').count()

// 1) 마법사로 관전 시작(기본 난이도) → 바로 진행된다
await openWizard(page)
await wizardPick(page, ['ngOpp:watch', 'ngStartWatch'])
await page.waitForFunction(() => document.querySelectorAll('svg.board circle.piece').length > 0, { timeout: 10000 })
const runningPieces = await pieces()

// 성향 셀렉트 존재(관전 패널)
const hasYellow = (await page.locator('select[data-ctl="personaYellow"]').count()) === 1
const hasBrown = (await page.locator('select[data-ctl="personaBrown"]').count()) === 1

// 2) ⏸ 멈춤 → 더 안 늘어남(예약된 1수 여유 두고 비교)
await page.locator('button[data-act="toggleWatch"]').click()
await page.waitForTimeout(300)
const pausedAt = await pieces()
await page.waitForTimeout(1600)
const afterPause = await pieces()

// ▶ 다시 시작 → 재개
await page.locator('button[data-act="toggleWatch"]').click()
await page.waitForFunction(
  (n) => document.querySelectorAll('svg.board circle.piece').length > n,
  afterPause,
  { timeout: 10000 },
)
const resumed = await pieces()

await browser.close()
console.log({ runningPieces, hasYellow, hasBrown, pausedAt, afterPause, resumed, errors: errors.length })
const ok =
  runningPieces > 0 && hasYellow && hasBrown && afterPause === pausedAt && resumed > afterPause && errors.length === 0
console.log(ok ? 'PASS: 마법사 관전 시작 + ⏸/▶ 동작 + 성향 셀렉트' : 'FAIL')
process.exit(ok ? 0 : 1)
