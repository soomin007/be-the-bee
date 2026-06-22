// 관전 시작/멈춤 + AI 성향 점검:
//  1) 관전 모드 선택만으로는 진행하지 않는다(자동 시작 X) — 멈출 여유.
//  2) ▶ 시작 → 수가 진행된다. ⏸ 멈춤 → 더 진행되지 않는다.
//  3) 노랑/갈색 성향 셀렉트 존재.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')

const pieces = () => page.locator('svg.board circle.piece').count()

// 관전 모드 선택
await page.locator('button[data-act="menuMode"]').click()
await page.locator('button[data-act="setMode:watch"]').click()

// 1) 선택만으로는 자동 진행 안 함 — 잠시 기다려도 말 0
await page.waitForTimeout(1200)
const idlePieces = await pieces()

// 성향 셀렉트 존재
const hasYellow = (await page.locator('select[data-ctl="personaYellow"]').count()) === 1
const hasBrown = (await page.locator('select[data-ctl="personaBrown"]').count()) === 1

// 2) ▶ 시작 → 진행
await page.locator('button[data-act="toggleWatch"]').click()
await page.waitForTimeout(1600)
const runningPieces = await pieces()

// ⏸ 멈춤 → 더 안 늘어남(예약된 1수 여유 두고 비교)
await page.locator('button[data-act="toggleWatch"]').click()
await page.waitForTimeout(300)
const pausedAt = await pieces()
await page.waitForTimeout(1600)
const afterPause = await pieces()

await browser.close()
console.log({ idlePieces, hasYellow, hasBrown, runningPieces, pausedAt, afterPause, errors: errors.length })
const ok =
  idlePieces === 0 && hasYellow && hasBrown && runningPieces > 0 && afterPause === pausedAt && errors.length === 0
console.log(ok ? 'PASS: 관전 자동시작 안 함 + ▶/⏸ 동작 + 성향 셀렉트' : 'FAIL')
process.exit(ok ? 0 : 1)
