// 컬러 테마 3종(꿀/고대비/벽돌) 보드 미리보기. dev 서버 필요.
// 몇 수 둬서 양 진영 타일·말을 만든 뒤 테마를 순환하며 각각 스크린샷.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')

async function play() {
  const c = page.locator('button[data-act="tileAndPiece"]')
  if (await c.count()) await c.first().click()
  await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
  await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })
}
for (let i = 0; i < 6; i++) await play()

// 테마 순환 버튼 라벨에서 현재 테마를 읽어 3종을 각각 찍는다.
const labels = []
for (const name of ['honey', 'contrast', 'terracotta']) {
  const label = await page.locator('button[data-act="cycleTheme"]').textContent()
  labels.push(label.trim())
  await page.locator('svg.board').screenshot({ path: `docs/design/shots/theme-${name}.png` })
  await page.locator('button[data-act="cycleTheme"]').click() // 다음 테마로
  await page.waitForTimeout(60)
}

await browser.close()
console.log('themes:', labels.join(' / '), '| errors:', errors.length)
console.log('saved: docs/design/shots/theme-honey.png, theme-contrast.png, theme-terracotta.png')
process.exit(errors.length === 0 ? 0 : 1)
