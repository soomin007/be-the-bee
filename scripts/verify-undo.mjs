// vs AI 에서 무르기가 "내 차례"로 돌아오고 AI 가 다시 두지 않는지 점검. dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('button[data-act="menuMode"]')

async function clickCenter(loc) {
  const b = await loc.boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
}

// vs AI
await page.locator('button[data-act="menuMode"]').click()
await page.locator('button[data-act="setMode:vsAi"]').click()

// 사람(노랑) 첫 수
await clickCenter(page.locator('svg.board polygon[opacity="0.22"]').first())
await page.waitForSelector('svg.board polygon[stroke="#16a34a"]')
await clickCenter(page.locator('svg.board polygon[stroke="#16a34a"]').first())

// AI(갈색) 수까지 (말 2개)
await page.waitForFunction(() => document.querySelectorAll('svg.board circle.piece').length >= 2, { timeout: 6000 })
const before = await page.locator('svg.board circle.piece').count()

// 무르기 → 내 차례로 돌아오고 AI 가 다시 두지 않아야 함
await page.locator('button[data-act="undo"]').click()
await page.waitForTimeout(900)
const after = await page.locator('svg.board circle.piece').count()
const turn = ((await page.locator('.panel .status-header').textContent()) ?? '').trim()

await browser.close()
const ok = before >= 2 && after === 0 && turn.includes('노랑') && errors.length === 0
console.log(`before=${before}, afterUndo=${after}, turn="${turn}", errors=${errors.length}`)
console.log(ok ? 'PASS: 무르기가 내 차례로 돌아옴 (AI 재착수 없음)' : 'FAIL')
process.exit(ok ? 0 : 1)
