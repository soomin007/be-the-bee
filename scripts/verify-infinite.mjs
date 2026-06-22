// 무한 모드 토글: 켜면 자원 표시가 타일 ∞ + 설정 영속, 끄면 숫자.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => {
  localStorage.setItem('be-the-bee/tutorial-seen', '1')
  localStorage.removeItem('be-the-bee/settings')
  localStorage.removeItem('be-the-bee/autosave')
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.supplies')

const tilesText = async () => (await page.locator('.supplies').textContent()) ?? ''
const before = await tilesText() // 타일 30 ...
await page.locator('button[data-act="toggleInfinite"]').click()
await page.waitForTimeout(60)
const after = await tilesText() // 타일 ∞ ...
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('be-the-bee/settings')).infiniteTiles)

await browser.close()
const onOk = before.includes('타일 30') && after.includes('타일 ∞') && saved === true
console.log({ before: before.trim().slice(0, 30), after: after.trim().slice(0, 30), saved, errors: errors.length })
console.log(onOk && errors.length === 0 ? 'PASS: 무한 모드 토글 + ∞ 표시 + 영속' : 'FAIL')
process.exit(onOk && errors.length === 0 ? 0 : 1)
