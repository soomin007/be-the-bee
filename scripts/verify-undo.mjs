// vs AI 에서 무르기가 "내 차례"로 돌아오고 AI 가 다시 두지 않는지 점검. dev 서버 필요.
import { chromium } from 'playwright'
import { prepPage, openWizard, wizardPick } from './lib/boot.mjs'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await prepPage(page) // 첫 접속 오버레이 스킵 + 새 게임 마법사 닫기

async function clickCenter(loc) {
  const b = await loc.boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
}

// vs AI 새 판(모드 변경은 새 게임 마법사 경유 — 2026-06-30 UI 개편)
await openWizard(page)
await wizardPick(page, ['ngOpp:ai', 'ngStartAi'])

// 사람(노랑) 첫 수: ② 행동 선택 → 프론티어 → 말
await page.locator('.action-bar button[data-act="tileAndPiece"]').click()
await clickCenter(page.locator('svg.board polygon[opacity="0.22"]').first())
await page.waitForSelector('svg.board polygon[stroke="#16a34a"]')
await clickCenter(page.locator('svg.board polygon[stroke="#16a34a"]').first())

// AI(갈색) 응수까지: 갈색 자원이 줄어들 때까지(①로 응수하면 말이 안 늘 수 있어 자원으로 본다)
await page.waitForFunction(
  () => {
    const t = document.querySelector('.board-status')?.textContent ?? ''
    const m = t.match(/갈색: 타일 (\d+|∞)/)
    return m !== null && m[1] !== '∞' && Number(m[1]) < 30
  },
  { timeout: 15000 },
)
const before = await page.locator('svg.board circle.piece').count()

// 무르기 → 내 차례로 돌아오고(AI 수 + 내 수 함께 취소) AI 가 다시 두지 않아야 함
await page.locator('button[data-act="undo"]').click()
await page.waitForTimeout(900)
const after = await page.locator('svg.board circle.piece').count()
const turn = ((await page.locator('.board-status .status-header').textContent()) ?? '').trim()

await browser.close()
const ok = before >= 1 && after === 0 && turn.includes('노랑') && errors.length === 0
console.log(`before=${before}, afterUndo=${after}, turn="${turn}", errors=${errors.length}`)
console.log(ok ? 'PASS: 무르기가 내 차례로 돌아옴 (AI 재착수 없음)' : 'FAIL')
process.exit(ok ? 0 : 1)
