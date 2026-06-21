// 복기 패널 스크린샷(시각 확인용). dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5180/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')
async function play() {
  const c = page.locator('button[data-act="tileAndPiece"]')
  if (await c.count()) await c.first().click()
  await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
  await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })
}
await play()
await play()
await play()
await page.locator('button[data-act="replayEnter"]').click()
await page.locator('button[data-act="replayNext"]').click()
await page.locator('button[data-act="replayNext"]').click()
await page.screenshot({ path: 'docs/design/replay-panel.png' })
await browser.close()
console.log('shot saved: docs/design/replay-panel.png')
