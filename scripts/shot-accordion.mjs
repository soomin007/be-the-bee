// 설정 아코디언 패널 캡처(기본 접힘 상태 + 화면 섹션 펼친 상태). dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => {
  localStorage.setItem('be-the-bee/tutorial-seen', '1')
  localStorage.removeItem('be-the-bee/settings')
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.acc')
await page.locator('.panel').screenshot({ path: 'docs/design/shots/panel-accordion.png' })

// 화면·설정 섹션 펼치기
await page.locator('button[data-act="sec:view"]').click()
await page.waitForTimeout(80)
await page.locator('.panel').screenshot({ path: 'docs/design/shots/panel-accordion-view.png' })
const accCount = await page.locator('.acc').count()
await browser.close()
console.log('acc sections:', accCount, '| saved panel-accordion(-view).png')
