// 여왕벌 설명 팝업 카드만 확대 캡처(내용 가독성 확인). dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 820 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('button[data-act="toggleQueen"]')
await page.locator('button[data-act="toggleQueen"]').click()
await page.waitForSelector('.modal-card.queen-info')
await page.waitForTimeout(200)
await page.locator('.modal-card.queen-info').screenshot({ path: 'docs/design/shots/queen-card.png' })
await browser.close()
console.log('saved docs/design/shots/queen-card.png')
