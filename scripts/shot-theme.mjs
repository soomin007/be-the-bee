// 벌 테마 2단계 시각 확인: 밀랍 타일 보드 + 결과 모달 마스코트. dev 서버 필요.
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
for (let i = 0; i < 5; i++) await play()
await page.screenshot({ path: 'docs/design/shots/theme-board.png' })
await browser.close()
// 결과 모달 마스코트는 scripts/shot-mascot.mjs 로 단독 미리보기(앱의 renderModal 이 비종료 시 modal-layer 를 비우기 때문)
console.log('shot saved: docs/design/shots/theme-board.png')
