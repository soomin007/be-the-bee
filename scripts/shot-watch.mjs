// 관전 모드 패널(시작/멈춤 + 양쪽 성향 + 속도) 캡처. dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 880 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.panel')
await page.locator('button[data-act="menuMode"]').click()
await page.locator('button[data-act="setMode:watch"]').click()
await page.waitForSelector('.ai-ctl')
await page.locator('.panel').screenshot({ path: 'docs/design/shots/panel-watch.png' })
await browser.close()
console.log('saved docs/design/shots/panel-watch.png')
