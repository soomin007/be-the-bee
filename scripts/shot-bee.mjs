// 말=벌 2.5D 개선 확대 캡처(그림자·구형 음영·하이라이트 확인). dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2 })
await page.evaluate(() => {}).catch(() => {})
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('be-the-bee/tutorial-seen', '1') // 튜토리얼 오버레이가 보드 클릭을 막지 않게
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')

async function play() {
  const c = page.locator('button[data-act="tileAndPiece"]')
  if (await c.count()) await c.first().click()
  await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
  await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })
}
for (let i = 0; i < 6; i++) await play()

// 확대해서 벌 디테일이 보이게: 줌 인(+ 키) 몇 번
await page.locator('svg.board').focus()
for (let i = 0; i < 4; i++) await page.keyboard.press('+')
await page.waitForTimeout(120)
await page.locator('svg.board').screenshot({ path: 'docs/design/shots/bee-2_5d.png' })
await browser.close()
console.log('saved docs/design/shots/bee-2_5d.png')
