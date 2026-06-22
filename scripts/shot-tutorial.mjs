// 튜토리얼 표지(1p) + 본문 페이지 캡처(워딩·레이아웃 확인). dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 980 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.tut-card')

// 표지(1p)
await page.locator('.tut-card').screenshot({ path: 'docs/design/shots/tutorial-cover.png' })

// 게임 진행(4p)으로 이동
for (let i = 0; i < 3; i++) await page.locator('button[data-tut="next"]').click()
await page.waitForTimeout(150)
await page.locator('.tut-card').screenshot({ path: 'docs/design/shots/tutorial-play.png' })

// 전략 TIP(6p)
for (let i = 0; i < 2; i++) await page.locator('button[data-tut="next"]').click()
await page.waitForTimeout(150)
await page.locator('.tut-card').screenshot({ path: 'docs/design/shots/tutorial-tip.png' })

await browser.close()
console.log('saved: tutorial-cover/play/tip.png')
