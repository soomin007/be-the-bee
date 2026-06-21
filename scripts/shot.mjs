// 보드 스크린샷(벌 말 디자인 확인용). dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const out = process.argv[3] ?? 'shot.png'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board polygon')

async function clickCenter(loc) {
  const box = await loc.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

// vs AI 로 전환 → 사람 첫 수 → AI 가 갈색 한 수 (벌 두 색 확인)
await clickCenter(page.locator('button[data-act="cycleMode"]'))
await clickCenter(page.locator('svg.board polygon[opacity="0.22"]').first())
await page.waitForSelector('svg.board polygon[stroke="#16a34a"]')
await clickCenter(page.locator('svg.board polygon[stroke="#16a34a"]').first())
await page.waitForTimeout(900) // AI 착수 대기

// 보드 가운데로 마우스 옮겨 휠로 줌 인(벌 크게 보기)
const bw = await page.locator('.board-wrap').boundingBox()
await page.mouse.move(bw.x + bw.width / 2, bw.y + bw.height / 2)
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300)
await page.waitForTimeout(200)

await page.locator('.board-wrap').screenshot({ path: out })
await browser.close()
console.log('saved', out)
