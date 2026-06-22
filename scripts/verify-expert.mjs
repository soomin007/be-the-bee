// 전문가 난이도: 메뉴에 노출 + vs AI 로 한 수 응수 + 에러 없음. (해설은 결정적 수에서만 떠 비결정적이라 선택 점검)
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('be-the-bee/tutorial-seen', '1')
  localStorage.setItem('be-the-bee/settings', JSON.stringify({ mode: 'vsAi', aiDifficulty: 'expert' }))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')

// 1) 난이도 메뉴에 '전문가' 가 있는지
await page.locator('button[data-act="menuDifficulty"]').click()
await page.waitForTimeout(80)
const hasExpert = await page.locator('button[data-act="setDiff:expert"]').count()
await page.locator('button[data-act="setDiff:expert"]').first().click() // 확실히 선택
await page.waitForTimeout(60)

// 2) 사람(노랑) 한 수 → 전문가(갈색) 응수 → 말 2개, 에러 0
const pieces = () => page.locator('svg.board circle.piece').count()
const c = page.locator('button[data-act="tileAndPiece"]')
if (await c.count()) await c.first().click()
await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })
await page.waitForFunction(() => document.querySelectorAll('svg.board circle.piece').length >= 2, { timeout: 15000 }).catch(() => {})
const n = await pieces()

await browser.close()
console.log({ hasExpert, pieces: n, errors: errors.length })
const ok = hasExpert === 1 && n >= 2 && errors.length === 0
console.log(ok ? 'PASS: 전문가 메뉴 노출 + vs AI 응수 + 에러 없음' : 'FAIL')
process.exit(ok ? 0 : 1)
