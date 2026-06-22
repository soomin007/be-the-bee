// 저장/불러오기 + 자동 이어하기 점검:
//  1) 몇 수 두고 → 새로고침하면 자동 복원(이어하기)
//  2) "저장" 후 더 두고 → "불러오기" 하면 저장 시점으로 되돌아감
//  3) "새 게임" 후 새로고침해도 새 게임(말 0)
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
// 깨끗한 출발점
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')

const pieces = () => page.locator('svg.board circle.piece').count()
async function play() {
  const c = page.locator('button[data-act="tileAndPiece"]')
  if (await c.count()) await c.first().click()
  await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
  await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })
}

// 1) 두 수 → 새로고침 → 자동 복원
await play()
await play()
const before = await pieces()
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')
const afterReload = await pieces()
const resumeOk = before === 2 && afterReload === 2

// 2) 저장 → 두 수 더 → 불러오기 → 저장 시점(2말)으로 복귀
await page.locator('button[data-act="saveGame"]').click()
const noticeShown = (await page.locator('.notice').count()) === 1
await play()
await play()
const grew = await pieces() // 4
await page.locator('button[data-act="loadGame"]').click()
const afterLoad = await pieces()
const loadOk = grew === 4 && afterLoad === 2

// 3) 새 게임 → 새로고침 → 새 게임 유지(0말)
await page.locator('button[data-act="new"]').click()
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')
const afterNewReload = await pieces()
const newOk = afterNewReload === 0

await browser.close()
console.log({ resumeOk, noticeShown, loadOk, newOk, errors: errors.length })
const ok = resumeOk && noticeShown && loadOk && newOk && errors.length === 0
console.log(ok ? 'PASS: 자동 이어하기 + 저장/불러오기 + 새 게임' : 'FAIL')
process.exit(ok ? 0 : 1)
