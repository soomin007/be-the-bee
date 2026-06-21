// 실제 브라우저(chromium)로 보드 클릭이 먹는지 검증. happy-dom 으로는 못 잡는
// 포인터 캡처/클릭 리타깃 회귀를 잡기 위함. dev 서버가 떠 있어야 한다.
import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board polygon')

// 셀 중심 픽셀을 실제로 클릭(겹친 요소가 있어도 최상단 핸들러가 onHexClick 처리).
async function clickCenter(locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('no bounding box')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

// 1) 첫 수: 타일 놓을 프론티어(점선, opacity 0.22) 클릭
await clickCenter(page.locator('svg.board polygon[opacity="0.22"]').first())

// 2) 말 놓을 칸(초록 테두리) 클릭 — 같은 칸의 타일/링 중 최상단이 처리
await page.waitForSelector('svg.board polygon[stroke="#16a34a"]')
await clickCenter(page.locator('svg.board polygon[stroke="#16a34a"]').first())
await page.waitForTimeout(200)

// 검증: 말(circle) 1개가 그려졌고 갈색 차례로 넘어갔는가
const circles = await page.locator('svg.board circle').count()
const panel = (await page.locator('.panel').textContent()) ?? ''
await browser.close()

const ok = circles === 1 && panel.includes('갈색 차례')
console.log(`circles=${circles}, 갈색차례=${panel.includes('갈색 차례')}, pageerrors=${errors.length}`)
if (errors.length) console.log('ERRORS:', errors.join(' | '))
console.log(ok ? 'PASS: 보드 클릭으로 수가 적용됨' : 'FAIL: 클릭이 안 먹힘')
process.exit(ok ? 0 : 1)
